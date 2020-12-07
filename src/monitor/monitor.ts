import { cborDecode, getSupportedChains, MonitorConfig, PathBuffer, StringMap, CheckedContract } from "@ethereum-sourcify/core";
import { Injector } from "@ethereum-sourcify/verification";
import Logger from "bunyan";
import Web3 from "web3";
import { SourceAddress, SourceFetcher } from "./source-fetcher";
import ethers from "ethers";
import { ValidationService } from "@ethereum-sourcify/validation";
import PendingContract from "./pending-contract";
import FetchFinalizer from "./fetch-finalizer";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multihashes = require("multihashes");

function createsContract(tx: any): boolean { // TODO type
    throw new Error("Not implemented");
}

class ChainMonitor {
    private chainId: string;
    private web3Provider: Web3;
    private sourceFetcher: SourceFetcher;
    private logger: Logger;
    private validationService: ValidationService;
    private injector: Injector;

    constructor(chainId: string, web3Url: string, sourceFetcher: SourceFetcher) {
        this.chainId = chainId;
        this.web3Provider = new Web3(web3Url);
        this.sourceFetcher = sourceFetcher;
        this.validationService = new ValidationService(); // TODO pass on from parent
    }

    start() {
        setInterval(this.fetchBlocks, null); // TODO
    }


    stop() {
        throw new Error("Not implemented");
    }

    private fetchBlocks = async () => { // TODO async or not
        const block = this.fetchNextBlock();
        for (const tx of block.transactions) {
            if (createsContract(tx)) {
                const address = ethers.utils.getContractAddress(tx);
                this.web3Provider.eth.getCode(address).then(bytecode => {
                    const numericBytecode = Web3.utils.hexToBytes(bytecode);
                    const cborData = cborDecode(numericBytecode);
                    const metadataAddress = this.getMetadataAddress(cborData);
                    const finalizer = new FetchFinalizer(this.chainId, address, bytecode, this.injector);
                    new PendingContract(metadataAddress, this.sourceFetcher, finalizer.finalize);
                });
            }
        }
    }

    private fetchNextBlock(): any { // TODO type
        throw new Error("Not implemented");
    }

    private getMetadataAddress(cborData: any): SourceAddress {
        // TODO reduce code duplication
        // TODO what can cborData.keys be?
        if (cborData.ipfs) {
            const metadataId = multihashes.toB58String(cborData.ipfs);
            return new SourceAddress("ipfs", metadataId);
        } else if (cborData.bzzr1) {
            const metadataId = Web3.utils.bytesToHex(cborData.bzzr1).slice(2);
            return new SourceAddress("bzzr1", metadataId);
        }

        throw new Error(`Unsupported metadata file format: ${Object(cborData).keys()}`);
    }
}

export class Monitor {
    private repositoryPath: string;
    private sourceFetcher = new SourceFetcher();
    private chainMonitors: ChainMonitor[];
    private injector: Injector;
    private logger = new Logger({ name: "Monitor" });

    constructor(config: MonitorConfig) {
        this.repositoryPath = config.repository || "repository";
        const chains = getSupportedChains();
        this.chainMonitors = chains.map((chain: any) => new ChainMonitor(
            chain.chainId.toString(),
            chain.web3,
            this.sourceFetcher
        ));

        Injector.createAsync({
            infuraPID: process.env.infuraPID,
            log: this.logger,
            offline: true // TODO copied from the original monitor implementation: how does this even work???
        }).then(injector => this.injector = injector);
    }

    start() {
        this.chainMonitors.forEach(chainMonitor => chainMonitor.start());
    }

    stop() {
        this.chainMonitors.forEach(chainMonitor => chainMonitor.stop());
    }
}