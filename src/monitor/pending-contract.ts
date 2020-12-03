import { CheckedContract, PathBuffer, StringMap } from '@ethereum-sourcify/core';
import Repo from './repo';
import { Injector } from '@ethereum-sourcify/verification';
import { ValidationService } from '@ethereum-sourcify/validation';
import Logger from 'bunyan';
import Web3 from 'web3';

type SourceInfo = { keccak256: string, urls: string[], name: string };
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
    private repo;
    private injector: Injector;
    private logger = new Logger({ name: "Pending Contract" });

    // TODO too many parameters - switch to single object
    // TODO injector - one instance per pending contract
    constructor(chain: string, address: string, bytecode: string, metadataHash: string, repo: Repo, injector: Injector) {
        this.chain = chain;
        this.address = address;
        this.bytecode = bytecode;
        
        this.repo = repo;
        this.repo.subscribe(metadataHash, this.addMetadata);

        this.injector = injector;
    }

    private addMetadata = (rawMetadata: string) => {
        const metadata: Metadata = JSON.parse(rawMetadata);
        this.pendingSources = {};
        for (const name in metadata.sources) {
            const source = metadata.sources[name];
            source.name = name;
            this.pendingSources[source.keccak256] = source;

            for (const url of source.urls) { // TODO make this more efficient; this might leave unnecessary subscriptions hanging
                this.repo.subscribe(url, this.addFetchedSource);
            }

        }
    }

    private addFetchedSource = (source: string) => {
        const hash = Web3.utils.keccak256(source);
        const deleted = delete this.pendingSources[hash];

        if (!deleted) {
            const msg = `Attempted addition of a nonrequired source (${hash}) to contract (${this.address})`;
            this.logger.error({ loc: "[PENDING_CONTRACT]", hash, address: this.address }, msg)
            throw new Error(msg);
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