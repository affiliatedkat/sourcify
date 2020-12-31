import { Session } from 'express-session';
import { PathContent, CheckedContract, isEmpty  } from '@ethereum-sourcify/core';
import Web3 from 'web3';

export interface PathContentMap {
    [id: string]: PathContent;
}

export type ContractLocation = {
    chain: string,
    address: string
}

export type ContractMeta = {
    compiledPath?: string,
    name?: string
    compilerVersion?: string,
    address?: string,
    networkId?: string,
    status?: Status,
    statusMessage?: string,
}

export type ContractWrapper =
    ContractMeta & {
    contract: CheckedContract
}
export interface ContractWrapperMap {
    [id: string]: ContractWrapper;
}

export type SessionMaps = {
    inputFiles: PathContentMap;
    contractWrappers: ContractWrapperMap;
};

export type MySession = 
    Session &
    SessionMaps & { 
    unusedSources: string[],
    started: boolean
};

export type Status = "perfect" | "partial" | "error";

export type SendableContract =
    ContractMeta & {
    files: {
        found: string[],
        missing: string[]
    },
    verificationId?: string
}

export function isVerifiable(contractWrapper: ContractWrapper) {
    const contract = contractWrapper.contract;
    return isEmpty(contract.missing)
        && isEmpty(contract.invalid)
        && Boolean(contractWrapper.compilerVersion)
        && Boolean(contractWrapper.address)
        && Boolean(contractWrapper.networkId)
        && (contractWrapper.status !== "partial" && contractWrapper.status !== "perfect"); // not already verified
}



function getSendableContract(contractWrapper: ContractWrapper, verificationId: string): SendableContract {
    const contract = contractWrapper.contract;
    let compilerVersion = undefined;
    if (contract.metadata.compiler && contract.metadata.compiler.version) {
        compilerVersion = contract.metadata.compiler.version;
    }

    return {
        compiledPath: contract.compiledPath,
        name: contract.name,
        compilerVersion,
        files: {
            found: Object.keys(contract.solidity),
            missing: Object.keys(contract.missing).concat(Object.keys(contract.invalid))
        },
        verificationId,
        status: contractWrapper.status || "error",
        statusMessage: contractWrapper.statusMessage
    };
}

export function getSessionJSON(session: MySession) {
    const contractWrappers = session.contractWrappers || {};
    const contracts: SendableContract[] = [];
    for (const id in contractWrappers) {
        const sendableContract = getSendableContract(contractWrappers[id], id);
        contracts.push(sendableContract);
    }

    const unused = session.unusedSources || [];
    return { contracts, unused };
}

export function generateId(obj: any): string {
    return Web3.utils.keccak256(JSON.stringify(obj));
}

export function updateUnused(unused: string[], session: MySession) {
    if (!session.unusedSources) {
        session.unusedSources = [];
    }
    session.unusedSources = unused;
}