process.env.TESTING = true;
process.env.LOCALCHAIN_URL = "http://localhost:8545";
process.env.MOCK_REPOSITORY = './dist/data/mock-repository';
process.env.MOCK_DATABASE = './dist/data/mock-database';

const chai = require("chai");
const chaiHttp = require("chai-http");
const Server = require("../dist/server/server").Server;
const util = require("util");
const fs = require("fs");
const rimraf = require("rimraf");
const path = require("path");
const MAX_INPUT_SIZE = require("../dist/server/controllers/VerificationController").default.MAX_INPUT_SIZE;
chai.use(chaiHttp);

// howto: https://www.digitalocean.com/community/tutorials/test-a-node-restful-api-with-mocha-and-chai
// howto-sessions: https://stackoverflow.com/questions/39662286/mocha-chai-request-and-express-session

describe("Server", async () => {
    const server = new Server();
    const promisified = util.promisify(server.app.listen);
    await promisified(server.port);
    console.log(`Injector listening on port ${server.port}!`);

    beforeEach(() => {
        rimraf.sync(process.env.MOCK_REPOSITORY);
    });

    after(() => {
        rimraf.sync(process.env.MOCK_REPOSITORY);
    });

    const sourcePath = path.join("test", "testcontracts", "1_Storage", "1_Storage.sol");
    const metadataPath = path.join("test", "testcontracts", "1_Storage", "metadata.json");
    const contractChain = "100"; // xdai
    const contractAddress = "0x656d0062eC89c940213E3F3170EA8b2add1c0143";
    const fakeAddress = "0x656d0062eC89c940213E3F3170EA8b2add1c0142"

    describe("/checkByAddress", () => {
        it("should fail for missing chainIds", (done) => {
            chai.request(server.app)
                .get("/checkByAddresses")
                .query({ addresses: "0x123" })
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.status).to.equal(400);
                    const errorMessage = res.body.error.toLowerCase();
                    chai.expect(errorMessage).to.contain("chainids");
                    chai.expect(errorMessage).to.not.contain("addresses");
                    done();
                });
        });

        it("should fail for missing addresses", (done) => {
            chai.request(server.app)
                .get("/checkByAddresses")
                .query({ chainIds: 1 })
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.status).to.equal(400);
                    const errorMessage = res.body.error.toLowerCase();
                    chai.expect(errorMessage).to.contain("addresses");
                    chai.expect(errorMessage).to.not.contain("chainids");
                    done();
                });
        });

        const assertStatus = (err, res, expectedStatus, done) => {
            chai.expect(err).to.be.null;
            chai.expect(res.status).to.equal(200);
            const resultArray = res.body;
            chai.expect(resultArray).to.have.a.lengthOf(1);
            const result = resultArray[0];
            chai.expect(result.address).to.equal(contractAddress);
            chai.expect(result.status).to.equal(expectedStatus);
            if (done) done();
        }

        it("should return false for previously unverified contract", (done) => {
            chai.request(server.app)
                .get("/checkByAddresses")
                .query({ chainIds: 100, addresses: contractAddress })
                .end((err, res) => assertStatus(err, res, "false", done));
        });

        it("should fail for invalid address", (done) => {
            chai.request(server.app)
                .get("/checkByAddresses")
                .query({ chainIds: contractChain, addresses: fakeAddress })
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.status).to.equal(400);
                    const errorMessage = res.body.error.toLowerCase();
                    chai.expect(errorMessage).to.contain("invalid");
                    chai.expect(errorMessage).to.contain("address");
                    done();
                });
        });

        it("should return true for previously verified contract", (done) => {
            chai.request(server.app)
                .get("/checkByAddresses")
                .query({ chainIds: 100, addresses: contractAddress })
                .end((err, res) => {
                    assertStatus(err, res, "false");
                    chai.request(server.app).post("/")
                        .field("address", contractAddress)
                        .field("chain", contractChain)
                        .attach("files", fs.readFileSync(metadataPath), "metadata.json")
                        .attach("files", fs.readFileSync(sourcePath))
                        .end((err, res) => {
                            chai.expect(err).to.be.null;
                            chai.expect(res.status).to.equal(200);

                            chai.request(server.app)
                                .get("/checkByAddresses")
                                .query({ chainIds: 100, addresses: contractAddress })
                                .end((err, res) => assertStatus(err, res, "perfect", done));
                        });     
                });
        }).timeout(3000);
    });

    describe("/", () => {
        it("should correctly inform for an address check of a non verified contract", (done) => {
            chai.request(server.app)
                .post("/")
                .field("chain", contractChain)
                .field("address", contractAddress)
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.body).to.haveOwnProperty("error");
                    // const errorMessage = res.body.error.toLowerCase(); // TODO should the message be checked and how?
                    chai.expect(res.status).to.equal(404);
                    done();
                });
        });

        const assertions = (err, res, done) => {
            chai.expect(err).to.be.null;
            chai.expect(res.status).to.equal(200);
            chai.expect(res.body).to.haveOwnProperty("result");
            const resultArr = res.body.result;
            chai.expect(resultArr).to.have.a.lengthOf(1);
            const result = resultArr[0];
            chai.expect(result.address).to.equal(contractAddress);
            chai.expect(result.status).to.equal("perfect");
            done();
        }

        it("should verify multipart upload", (done) => {
            chai.request(server.app)
                .post("/")
                .field("address", contractAddress)
                .field("chain", contractChain)
                .attach("files", fs.readFileSync(metadataPath), "metadata.json")
                .attach("files", fs.readFileSync(sourcePath), "1_Storage.sol")
                .end((err, res) => assertions(err, res, done));
        });

        it("should verify json upload with string properties", (done) => {
            chai.request(server.app)
                .post("/")
                .send({
                    address: contractAddress,
                    chain: contractChain,
                    files: {
                        "metadata.json": fs.readFileSync(metadataPath).toString(),
                        "1_Storage.sol": fs.readFileSync(sourcePath).toString()
                    }
                })
                .end((err, res) => assertions(err, res, done));
        });

        it("should verify json upload with Buffer properties", (done) => {
            chai.request(server.app)
                .post("/")
                .send({
                    address: contractAddress,
                    chain: contractChain,
                    files: {
                        "metadata.json": fs.readFileSync(metadataPath),
                        "1_Storage.sol": fs.readFileSync(sourcePath)
                    }
                })
                .end((err, res) => assertions(err, res, done));
        });

        it("should return Bad Request for missing file", (done) => {
            chai.request(server.app)
                .post("/")
                .field("address", contractAddress)
                .field("chain", contractChain)
                .attach("files", fs.readFileSync(metadataPath), "metadata.json")
                .end((err, res) => {
                    chai.expect(err).to.be.null;
                    chai.expect(res.body).to.haveOwnProperty("error");
                    const errorMessage = res.body.error.toLowerCase();
                    chai.expect(res.status).to.equal(400);
                    chai.expect(errorMessage).to.include("missing");
                    chai.expect(errorMessage).to.include("1_Storage.sol".toLowerCase());
                    done();
                });
        });
    });

    describe("verification v2", () => {
        it("should not verify after addition of metadata+source, but should after providing address+networkId", (done) => {
            const agent = chai.request.agent(server.app);
            agent.post("/files")
                .attach("files", fs.readFileSync(sourcePath), "1_Storage.sol")
                .attach("files", fs.readFileSync(metadataPath), "metadata.json")
                .then(res => {
                    chai.expect(res.status).to.equal(200);
                    const contracts = res.body.contracts;
                    chai.expect(contracts).to.have.a.lengthOf(1);
                    const contract = contracts[0];
                    chai.expect(contract.status).to.equal("error");
                    chai.expect(res.body.unused).to.be.empty;
                    contract.address = contractAddress;
                    contract.networkId = contractChain;

                    agent.post("/verify")
                        .send({ contracts })
                        .end((err, res) => {
                            chai.expect(err).to.be.null;
                            chai.expect(res.status).to.equal(200);
                            const contracts = res.body.contracts;
                            chai.expect(contracts).to.have.a.lengthOf(1);
                            const contract = contracts[0];
                            chai.expect(contract.status).to.equal("perfect");
                            chai.expect(res.body.unused).to.be.empty;
                            done();
                        });
            });
        }).timeout(3000);

        const assertAfterMetadataUpload = (err, res) => {
            chai.expect(err).to.be.null;
            chai.expect(res.status).to.equal(200);
            chai.expect(res.body.unused).to.be.empty;

            const contracts = res.body.contracts;
            chai.expect(contracts).to.have.a.lengthOf(1);
            const contract = contracts[0];

            chai.expect(contract.name).to.equal("Storage");
            chai.expect(contract.status).to.equal("error");
        }

        it("should not verify when session cookie not stored clientside", (done) => {
            chai.request(server.app)
                .post("/files")
                .attach("files", fs.readFileSync(metadataPath), "metadata.json")
                .end((err, res) => {
                    assertAfterMetadataUpload(err, res);

                    chai.request(server.app)
                        .post("/files")
                        .attach("files", fs.readFileSync(sourcePath), "1_Storage.sol")
                        .end((err, res) => {
                            chai.expect(err).to.be.null;
                            chai.expect(res.status).to.equal(200);

                            chai.expect(res.body.unused).to.deep.equal(["1_Storage.sol"]);
                            chai.expect(res.body.contracts).to.be.empty;
                            done();
                        });
                });
        }).timeout(3000);

        const assertAllFound = (err, res, finalStatus) => {
            chai.expect(err).to.be.null;
            chai.expect(res.status).to.equal(200);
            chai.expect(res.body.unused).to.be.empty;

            const contracts = res.body.contracts;
            chai.expect(contracts).to.have.a.lengthOf(1);
            const contract = contracts[0];

            chai.expect(contract.name).to.equal("Storage");
            chai.expect(contract.status).to.equal(finalStatus);
        }

        it("should verify when session cookie stored clientside", (done) => {
            const agent = chai.request.agent(server.app);
            agent.post("/files")
                .attach("files", fs.readFileSync(metadataPath), "metadata.json")
                .end((err, res) => {
                    assertAfterMetadataUpload(err, res);
                    const contracts = res.body.contracts;

                    agent.post("/files")
                        .attach("files", fs.readFileSync(sourcePath), "1_Storage.sol")
                        .end((err, res) => {
                            contracts[0].networkId = contractChain;
                            contracts[0].address = contractAddress;
                            assertAllFound(err, res, "error");

                            agent.post("/verify")
                                .send({ contracts })
                                .end((err, res) => {
                                    assertAllFound(err, res, "perfect");
                                    done();
                                });
                        });
                });
        }).timeout(3000);

        it("should fail if too many files uploaded, but should succeed after deletion", (done) => {
            const agent = chai.request.agent(server.app);
            const arr = [];
            for (let i = 0; i < MAX_INPUT_SIZE; ++i) {
                arr.push("a");
            }

            const file = arr.join("");
            agent.post("/files")
                .attach("files", Buffer.from(file))
                .then(res => {
                    chai.expect(res.status).to.equal(200);

                    agent.post("/files")
                        .attach("files", Buffer.from("a"))
                        .then(res => {
                            chai.expect(res.status).to.equal(400);
                            chai.expect(res.body.error);

                            agent.post("/restart-session")
                                .then(res => {
                                    chai.expect(res.status).to.equal(200);

                                    agent.post("/files")
                                        .attach("files", Buffer.from("a"))
                                        .then(res => {
                                            chai.expect(res.status).to.equal(200);
                                            done();
                                        });
                                });
                        });
                }); 
        });
    });
});