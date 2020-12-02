import { CheckedContract, PathBuffer, StringMap } from '@ethereum-sourcify/core';
import Repo from './repo';
import { Injector } from '@ethereum-sourcify/verification';
import { ValidationService } from '@ethereum-sourcify/validation';
import Logger from 'bunyan';

type SourceInfo = { keccak256: string, urls: string[] };
interface SourceInfoMap {
    [name: string]: SourceInfo;
}
type Metadata = { sources: SourceInfoMap };

export default class PendingContract {
    private chain: string;
    private address: string;
    private bytecode: string;
    private pendingSources: SourceInfoMap;
    private fetchedSources: StringMap;
    private sourceRepo: Repo;
    private metadataRepo: Repo;
    private injector: Injector;
    private logger = new Logger({ name: "Pending Contract" });

    // TODO too many parameters - switch to single object
    // TODO injector - one instance per pending contract
    constructor(chain: string, address: string, bytecode: string, metadataHash: string, metadataRepo: Repo, sourceRepo: Repo, injector: Injector) {
        this.chain = chain;
        this.address = address;
        this.bytecode = bytecode;
        
        this.metadataRepo = metadataRepo;
        this.sourceRepo = sourceRepo;

        this.injector = injector;

        this.metadataRepo.subscribe(metadataHash, this.addMetadata);
    }

    private addMetadata = (rawMetadata: string) => {
        const metadata: Metadata = JSON.parse(rawMetadata);
        this.pendingSources = metadata.sources;
        for (const name in this.pendingSources) {
            const source = this.pendingSources[name];
            this.sourceRepo.subscribe(source.keccak256, this.addFetchedSource);
        }
    }

    private addFetchedSource = (source: string) => {
        const deleted = delete this.pendingSources[name];

        if (!deleted) {
            throw new Error(`Attempted adding of a nonrequired source (${name}) to contract (${this.address})`);
        }

        this.fetchedSources[name] = source;
        if (isObjectEmpty(this.pendingSources)) {
            this.finalize();
        }
    }

    private finalize(): void {
        const pathBuffers: PathBuffer[] = [];
        for (const sourceName in this.fetchedSources) {
            const sourceValue = this.fetchedSources[sourceName];
            pathBuffers.push({ path: sourceName, buffer: Buffer.from(sourceValue) });
        }

        const contracts = new ValidationService().checkFiles(pathBuffers);
        this.checkContractArray(contracts);

        this.injector.inject({
            addresses: [this.address],
            chain: this.chain,
            bytecode: this.bytecode,
            contracts
        });
    }

    private checkContractArray(contracts: CheckedContract[]) {
        if (contracts.length !== 1) {
            const msg = `Cannot inject more than one contract per chain address; ${contracts.length} attempted.`;
            this.logger.error({
                loc: "[PENDING_CONTRACT]",
                chain: this.chain,
                address: this.address
            }, msg);
            throw new Error(msg);
        }

        const contract = contracts[0];
        if (!contract.isValid()) {
            const msg = `Invalid contract ${contract.name} at chain ${this.chain} at address ${this.address}.`;
            this.logger.error({
                loc: "[PENDING_CONTRACT]",
                name: contract.name,
                chain: this.chain,
                address: this.address,
                missing: Object.keys(contract.missing)
            }, msg);
            throw new Error(msg);
        }
    }
}

function isObjectEmpty(object: any): boolean {
    return Object.keys(object).length === 0;
}