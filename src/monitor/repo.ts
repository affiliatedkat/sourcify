import Logger from "bunyan";
import nodeFetch from "node-fetch";

type FileFetcher = (url: string) => Promise<string>;

type FetchCallback= (fetchedFile: string) => any;

declare interface Subscriptions {
    [url: string]: Array<FetchCallback>;
}

const IPFS_PREFIX = "dweb:/ipfs/";
const IPFS_BASE_URL = "https://ipfs.infura.io:5001/api/v0/cat?arg=";

export default class Repo {
    private subscriptions: Subscriptions;
    private logger = new Logger({ name: "Repo" }); // TODO what kind of Repo?

    constructor(refreshInterval = 15) {
        setInterval(this.fetch.bind(this), refreshInterval * 1000);
    }

    private fetch(): void {
        for (const url in this.subscriptions) {
            this.performFetch(url).then(file => {
                this.notifySubscribers(url, file);
            }).catch(err => {
                this.logger.error(err.message);
            });
        }
    }

    private async performFetch(url: string): Promise<string> {
        if (url.startsWith(IPFS_PREFIX)) {
            const ipfsArg = url.split(IPFS_PREFIX)[1];
            return nodeFetch(IPFS_BASE_URL + ipfsArg).then(resp => {
                return resp.text();
            }).catch(err => {
                throw err;
            });
        } // TODO
    }

    private notifySubscribers(url: string, file: string) {
        const callbacks = this.subscriptions[url];
        callbacks.forEach(callback => callback(file));
    }

    subscribe(url: string, callback: FetchCallback): void {
        if (!(url in this.subscriptions)) {
            this.subscriptions[url] = [];
        }

        this.subscriptions[url].push(callback);
    }
}