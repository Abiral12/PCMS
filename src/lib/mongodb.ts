// lib/mongodb.ts
import mongoose from 'mongoose';

type MongooseConn = typeof mongoose;
type MongoosePromise = Promise<MongooseConn>;

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: { conn: MongooseConn | null; promise: MongoosePromise | null } | undefined;
}

const cached = globalThis._mongooseCache ?? (globalThis._mongooseCache = { conn: null, promise: null });

export default async function dbConnect(): Promise<MongooseConn> {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;            // ← read lazily
  if (!uri) {
    // Throw only when a route actually tries to connect
    throw new Error('MONGODB_URI is not set (check .env.local / deployment env).');
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        // dbName: process.env.MONGODB_DB, // uncomment if you use a separate DB name
        bufferCommands: false,
      })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}