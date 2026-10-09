import { MongoClient, type Collection, type Db, ObjectId } from "mongodb";

export interface StoredReport {
  _id: ObjectId;
  trackingCode: string;
  title: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  severity: "low" | "medium" | "high";
  status: "received" | "reviewing" | "scheduled" | "resolved";
  photoId: string | null;
  reporterName: string | null;
  createdAt: Date;
}

export interface StoredPhoto {
  _id: ObjectId;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
  createdAt: Date;
}

let clientPromise: Promise<MongoClient> | null = null;
let indexesPromise: Promise<void> | null = null;

async function getDatabase(): Promise<Db> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not configured");
  }

  if (!clientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    clientPromise = client.connect().catch((error: unknown) => {
      clientPromise = null;
      throw error;
    });
  }

  const client = await clientPromise;
  return client.db(process.env.MONGO_DB_NAME?.trim() || "roadwatch");
}

export async function getRoadwatchCollections(): Promise<{
  reports: Collection<StoredReport>;
  photos: Collection<StoredPhoto>;
}> {
  const database = await getDatabase();
  const reports = database.collection<StoredReport>("reports");
  const photos = database.collection<StoredPhoto>("photos");

  if (!indexesPromise) {
    indexesPromise = Promise.all([
      reports.createIndex({ trackingCode: 1 }, { unique: true }),
      reports.createIndex({ createdAt: -1 }),
    ])
      .then(() => undefined)
      .catch((error: unknown) => {
        indexesPromise = null;
        throw error;
      });
  }

  await indexesPromise;
  return { reports, photos };
}

