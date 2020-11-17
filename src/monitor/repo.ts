export default class Repo<T> {
    private address: string;
    private refreshInterval: number;
    private interval: NodeJS.Timeout;
    private subscriptions: any; // TODO

    constructor(address: string, refreshInterval = 15) {
        this.address = address;
        this.refreshInterval = refreshInterval;

        this.interval = setInterval(this.fetch.bind(this), refreshInterval * 1000);
    }

    private fetch(): void {

    }

    subscribe(hash: string, callback: Function) {
        if (!(hash in this.subscriptions)) {
            this.subscriptions[hash] = [];
        }

        this.subscriptions[hash].push(callback);
    }
}