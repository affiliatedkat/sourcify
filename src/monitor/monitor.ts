import { getSupportedChains, MonitorConfig } from "@ethereum-sourcify/core";
import { Injector } from "@ethereum-sourcify/verification";
import Logger from "bunyan";
import Web3 from "web3";
import SourceFetcher from "./source-fetcher";

class ChainMonitor {
    private chainId: string;
    private web3Provider: Web3;
    private sourceFetcher: SourceFetcher;

    constructor(chainId: string, web3Url: string, sourceFetcher: SourceFetcher) {
        this.chainId = chainId;
        this.web3Provider = new Web3(web3Url);
        this.sourceFetcher = sourceFetcher;
    }

    start() {

    }

    stop() {

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