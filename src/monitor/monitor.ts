import { getSupportedChains, MonitorConfig } from "@ethereum-sourcify/core";
import Web3 from "web3";
import Repo from "./repo";

class ChainMonitor {
    private chainId: string;
    private web3Provider: Web3;

    constructor(chainId: string, web3Url: string) {
        this.chainId = chainId;
        this.web3Provider = new Web3(web3Url);
    }
}

export class Monitor {
    private repository: string;
    private repo = new Repo();
    private chainMonitors: ChainMonitor[];

    constructor(config: MonitorConfig) {
        this.repository = config.repository || "repository";
        const chains = getSupportedChains();
        this.chainMonitors = chains.map(chain => new ChainMonitor(
            chain.chainId.toString(),
            chain.web3
        ));
    }
}