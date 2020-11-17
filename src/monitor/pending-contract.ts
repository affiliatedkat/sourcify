import { cborDecode } from '@ethereum-sourcify/core';
import Repo from './repo';
import Web3 from 'web3';
import { Injector } from '@ethereum-sourcify/verification';

type Source = {keccak256: string, urls: string[]};
interface SourceMap {
    [name: string]: Source;
}
type Metadata = {sources: SourceMap};

export default class PendingContract {
    private chain: string;
    private address: string;
    private rawMetadata: string;
    private bytecode: string;
    private pendingSources: SourceMap;
    private fetchedSources: SourceMap;
    private sourceRepo: Repo<Source>;
    private metadataRepo: Repo<Metadata>;
    private injector: Injector;

    // TODO too many parameters
    constructor(chain: string, address: string, bytecode: string, metadataHash: string, metadataRepo: Repo<Metadata>, sourceRepo: Repo<Source>, injector: Injector) {
        this.chain = chain;
        this.address = address;
        this.bytecode = bytecode;
        
        this.metadataRepo = metadataRepo;
        this.sourceRepo = sourceRepo;

        this.injector = injector;

        this.metadataRepo.subscribe(metadataHash, this.addMetadata);
    }

    private addMetadata(rawMetadata: string) {
        this.rawMetadata = rawMetadata;
        const metadata: Metadata = JSON.parse(rawMetadata);
        this.pendingSources = metadata.sources;
        for (const name in this.pendingSources) {
            const source = this.pendingSources[name];
            this.sourceRepo.subscribe(source.keccak256, this.addFetchedSource);
        }
    }

    private addFetchedSource(name: string, source: Source) {
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
        this.injector.inject({
            addresses: [this.address],
            chain: this.chain,
            bytecode: this.bytecode,
            // files TODO
        });
    }
}

function isObjectEmpty(object: any): boolean {
    return Object.keys(object).length === 0;
}