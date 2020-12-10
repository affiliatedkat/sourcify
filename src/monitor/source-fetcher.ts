import Logger from "bunyan";
import nodeFetch from "node-fetch";
import { IGateway, SimpleGateway, SourceOrigin } from "./gateway";

type FetchedFileCallback= (fetchedFile: string) => any;

const IPFS_PREFIX = "dweb:/ipfs/";
const SWARM_PREFIX = "bzz-raw:/";

export class SourceAddress {
    origin: SourceOrigin;
    id: string;

    constructor(origin: SourceOrigin, id: string) {
        this.origin = origin;
        this.id = id;
    }

    getUniqueIdentifier(): string {
        return this.origin + "-" + this.id;
    }

    static from(url: string): SourceAddress {
        if (url.startsWith(IPFS_PREFIX)) {
            return new SourceAddress("ipfs", url.slice(IPFS_PREFIX.length));
        } else if (url.startsWith(SWARM_PREFIX)) {
            return new SourceAddress("bzzr1", url.slice(SWARM_PREFIX.length));
        }

        throw new Error(`Could not deduce source origin from url: ${url}`);
    }
}

type Subscription = {
    sourceAddress: SourceAddress;
    subscribers: Array<FetchedFileCallback>;
}

declare interface Subscriptions {
    [hash: string]: Subscription
}

export class SourceFetcher {
    private subscriptions: Subscriptions;
    private logger = new Logger({ name: "SourceFetcher" });

    private gateways: IGateway[] = [
        new SimpleGateway("ipfs", "https://ipfs.infura.io:5001/api/v0/cat?arg="),
        new SimpleGateway("bzzr1", "https://swarm-gateways.net/bzz-raw:/")
    ];

    constructor(refreshInterval = 15) {
        setInterval(this.fetch, refreshInterval * 1000);
    }

    private fetch = (): void => {
        for (const sourceHash in this.subscriptions) {
            const subscription = this.subscriptions[sourceHash];
            const gateway = this.findGateway(subscription.sourceAddress);
            const fetchUrl = gateway.createUrl(subscription.sourceAddress.id);
            nodeFetch(fetchUrl).then(resp => {
                return resp.text();
            }).then(file => {
                this.notifySubscribers(sourceHash, file);
            }).catch(err => {
                this.logger.error(err.message);
            });
        }
    }

    private findGateway(sourceAddress: SourceAddress) {
        for (const gateway of this.gateways) {
            if (gateway.worksWith(sourceAddress.origin)) {
                return gateway;
            }
        }

        throw new Error(`Gateway not found for ${sourceAddress.origin}`);
    }

    private notifySubscribers(hash: string, file: string) {
        const subscription = this.subscriptions[hash];
        delete this.subscriptions[hash];
        subscription.subscribers.forEach(callback => callback(file));
    }

    subscribe(sourceAddress: SourceAddress, callback: FetchedFileCallback): void {
        const sourceHash = sourceAddress.getUniqueIdentifier();
        if (!(sourceHash in this.subscriptions)) {
            this.subscriptions[sourceHash] = { sourceAddress, subscribers: [] };
        }

        this.subscriptions[sourceHash].subscribers.push(callback);
    }
}