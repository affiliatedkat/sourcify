export type SourceOrigin = "ipfs" | "bzzr1"; // TODO bzzr0?

export declare interface IGateway {
    worksWith: (origin: SourceOrigin) => boolean;
    createUrl: (fetchId: string) => string;
}

export class SimpleGateway implements IGateway {
    private origin: SourceOrigin;
    private baseUrl: string;

    constructor(origin: SourceOrigin, baseUrl: string) {
        this.origin = origin;
        this.baseUrl = baseUrl;
    }

    worksWith(origin: SourceOrigin): boolean {
        return origin === this.origin;
    }

    createUrl(fetchId: string): string {
        return this.baseUrl + fetchId;
    }
}