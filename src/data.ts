import * as Mongo from 'mongodb';

const dbUrl = 'mongodb://localhost:27017';
const dbName = 'shimarin';

export async function addAccountConnection(
    discordId: string,
    anilistId: string,
    token: string
): Promise<void> {
    await insert('anilistConnections', {
        _id: discordId,
        anilistId: anilistId,
        token: token
    });
}

export async function getAccountConnection(
    discordId: string
): Promise<string | null> {
    return await find('anilistConnections',  { _id: discordId });
}

async function find(collectionName: string, query: any): Promise<any> {
    const col = await collection(collectionName);
    return await col.findOne(query);
}

async function insert(collectionName: string, document: any): Promise<void> {
    const col = await collection(collectionName);
    await col.insertOne(document);
}

async function collection(
    collectionName: string, 
): Promise<Mongo.Collection> {
    const client = await Mongo.MongoClient.connect(dbUrl);
    const db = client.db(dbName);
    return db.collection(collectionName);
}
