import { Session } from 'express-session';
import { Match, PathBuffer, CheckedContract } from '@ethereum-sourcify/core';

export interface PathBufferMap {
    [id: string]: PathBuffer;
}

export type ContractLocation = {
    chain: string,
    address: string
}
  
export type ContractWrapper =
    ContractLocation & {
    contract: CheckedContract,
    valid: boolean
};
  
export interface ContractLocationMap {
    [id: string]: ContractLocation;
}

export interface ContractWrapperMap {
    [id: string]: ContractWrapper;
}

export type SessionMaps = {
    inputFiles: PathBufferMap;
    pendingContracts: ContractWrapperMap;
};

export type MySession = 
    Session &
    SessionMaps & { 
    unusedSources: string[],
    started: boolean
};

export interface MatchMap {
    [id: string]: Match;
}