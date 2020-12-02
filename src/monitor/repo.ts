import Logger from "bunyan";

type FileFetcher = (url: string) => Promise<string>;

type FetchCallback= (fetchedFile: string) => any;

declare interface Subscriptions {
    [url: string]: Array<FetchCallback>;
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
        for (const url in this.subscriptions) {
            this.fetcher(url).then(file => {
                this.notifySubscribers(url, file);
            }).catch(err => {
                this.logger.error(err);
            });
        }
    }

    private notifySubscribers(url: string, file: string) {
        const callbacks = this.subscriptions[url];
        callbacks.forEach(callback => callback(file));
    }

    subscribe(url: string, callback: FetchCallback) {
        if (!(url in this.subscriptions)) {
            this.subscriptions[url] = [];
        }

        this.subscriptions[url].push(callback);
    }
}