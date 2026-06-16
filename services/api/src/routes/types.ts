import type express from 'express';
import type postgres from 'postgres';
import type { Redis } from 'ioredis';
import type { infra } from '../infra.js';

export type SqlClient = ReturnType<typeof postgres>;
export type RedisClient = Redis;

export type RouteDeps = {
  app: express.Express;
  sql: SqlClient;
  redis: RedisClient;
  infra: typeof infra;
};
