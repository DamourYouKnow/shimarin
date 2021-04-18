import * as Mongo from 'mongodb';

const dbUrl = 'mongodb://localhost:27017';
const dbName = 'shimarin';

interface AniListConnection {
    discordId: string,
    anilistId: string,
    token: string
}

export async function addAccountConnection(
    discordId: string,
    anilistId: string,
    token: string
): Promise<void> {
    await upsert('anilistConnections', { _id: discordId }, {
        $set: {
            _id: discordId,
            anilistId: anilistId,
            token: token
        }
    });
}

export async function getAccountConnection(
    discordId: string
): Promise<AniListConnection | null> {
    const data = await find('anilistConnections',  { _id: discordId });
    if (data == null) return null;
    return {
        discordId: data._id,
        anilistId: data.anilistId,
        token: data.token
    };
}

async function find(collectionName: string, query: any): Promise<any> {
    const col = await collection(collectionName);
    return await col.findOne(query);
}

async function insert(
    collectionName: string,
    document: any
): Promise<Mongo.InsertOneWriteOpResult<any>> {
    const col = await collection(collectionName);
    return await col.insertOne(document);
}

async function upsert(
    collectionName: string,
    query: any,
    document: any
):  Promise<Mongo.UpdateWriteOpResult> {
    const col = await collection(collectionName);
    return await col.updateOne(query, document, {upsert: true});
}

async function collection(
    collectionName: string, 
): Promise<Mongo.Collection> {
    const client = await Mongo.MongoClient.connect(dbUrl, {
        useUnifiedTopology: true
    });
    const db = client.db(dbName);
    return db.collection(collectionName);
}
