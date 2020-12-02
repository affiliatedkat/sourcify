import Logger from "bunyan";

type FileFetcher = (hash: string) => Promise<string>;

type FetchCallback= (fetchedFile: string) => any;

declare interface Subscriptions {
    [hash: string]: Array<FetchCallback>;
}

export default class Repo {
    private fetcher: FileFetcher;
    private subscriptions: Subscriptions;
    private logger = new Logger({ name: "Repo" }); // TODO what kind of Repo?

    constructor(fetcher: FileFetcher, refreshInterval = 15) {
        this.fetcher = fetcher;
        setInterval(this.fetch.bind(this), refreshInterval * 1000);
    }

    private fetch(): void {
        for (const hash in this.subscriptions) {
            this.fetcher(hash).then(file => {
                this.notifySubscribers(hash, file);
            }).catch(err => {
                this.logger.error(err);
            });
        }
    }

    private notifySubscribers(hash: string, file: string) {
        const callbacks = this.subscriptions[hash];
        callbacks.forEach(callback => callback(file));
    }

    subscribe(hash: string, callback: FetchCallback) {
        if (!(hash in this.subscriptions)) {
            this.subscriptions[hash] = [];
        }

        this.subscriptions[hash].push(callback);
    }
}