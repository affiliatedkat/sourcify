import Logger from "bunyan";
import nodeFetch from "node-fetch";
import { IGateway, SimpleGateway, SourceOrigin } from "./gateway";

type FileFetcher = (url: string) => Promise<string>;

type FetchCallback= (fetchedFile: string) => any;

class SourceInfo { // TODO, name colision with class in pending-contract
    origin: SourceOrigin;
    id: string;

    constructor(origin: SourceOrigin, id: string) {
        this.origin = origin;
        this.id = id;
    }

    getUniqueIdentifier() {
        return this.origin + "-" + this.id;
    }
};

type Subscription = {
    sourceInfo: SourceInfo;
    subscribers: Array<FetchCallback>;
}

declare interface Subscriptions {
    [hash: string]: Subscription
}

export default class SourceFetcher {
    private subscriptions: Subscriptions;
    private logger = new Logger({ name: "SourceFetcher" });

    private gateways: IGateway[] = [
        new SimpleGateway("ipfs", "https://ipfs.infura.io:5001/api/v0/cat?arg="),
        new SimpleGateway("swarm", "https://swarm-gateways.net/bzz-raw:/")
    ];

    constructor(refreshInterval = 15) {
        setInterval(this.fetch, refreshInterval * 1000);
    }

    private fetch = (): void => {
        for (const sourceHash in this.subscriptions) {
            const subscription = this.subscriptions[sourceHash];
            const gateway = this.findGateway(subscription.sourceInfo);
            const fetchUrl = gateway.createUrl(subscription.sourceInfo.id);
            nodeFetch(fetchUrl).then(resp => {
                return resp.text();
            }).then(file => {
                this.notifySubscribers(sourceHash, file);
            }).catch(err => {
                this.logger.error(err.message);
            });
        }
    }

    private findGateway(sourceInfo: SourceInfo) {
        for (const gateway of this.gateways) {
            if (gateway.worksWith(sourceInfo.origin)) {
                return gateway;
            }
        }

        throw new Error(`Gateway not found for ${sourceInfo.origin}`);
    }

    private notifySubscribers(hash: string, file: string) {
        const subscription = this.subscriptions[hash];
        delete this.subscriptions[hash];
        subscription.subscribers.forEach(callback => callback(file));
    }

    subscribe(sourceInfo: SourceInfo, callback: FetchCallback): void {
        const sourceHash = sourceInfo.getUniqueIdentifier();
        if (!(sourceHash in this.subscriptions)) {
            this.subscriptions[sourceHash] = { sourceInfo, subscribers: [] };
        }

        this.subscriptions[sourceHash].subscribers.push(callback);
    }
}