import Logger from "bunyan";
import nodeFetch from "node-fetch";

type FileFetcher = (url: string) => Promise<string>;

type FetchCallback= (fetchedFile: string) => any;

declare interface Subscriptions {
    [url: string]: Array<FetchCallback>;
}

const IPFS_PREFIX = "dweb:/ipfs/";
const IPFS_BASE_URL = "https://ipfs.infura.io:5001/api/v0/cat?arg=";

const SWARM_PREFIX = ""; // TODO

export default class Repo {
    private subscriptions: Subscriptions;
    private logger = new Logger({ name: "Repo" });

    constructor(refreshInterval = 15) {
        setInterval(this.fetch, refreshInterval * 1000);
    }

    private fetch = (): void => {
        for (const url in this.subscriptions) {
            let fetchArg = null;
            if (url.startsWith(IPFS_PREFIX)) {
                fetchArg = url.split(IPFS_PREFIX)[1];
            } 
            // TODO else if
            else {
                this.logger.error({ loc: "[REPO]", url }, "URL points to an unknown origin.");
                break;
            }

            nodeFetch(IPFS_BASE_URL + fetchArg).then(resp => {
                return resp.text();
            }).then(file => {
                this.notifySubscribers(url, file);
            }).catch(err => {
                this.logger.error(err.message);
            });
        }
    }

    private notifySubscribers(url: string, file: string) {
        const callbacks = this.subscriptions[url];
        delete this.subscriptions[url];
        callbacks.forEach(callback => callback(file));
    }

    subscribe(url: string, callback: FetchCallback): void {
        if (!(url in this.subscriptions)) {
            this.subscriptions[url] = [];
        }

        this.subscriptions[url].push(callback);
    }
}