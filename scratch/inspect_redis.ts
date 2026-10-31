import Redis from 'ioredis';

async function main() {
  const redis = new Redis('redis://localhost:6379');
  const keys = await redis.keys('*');
  console.log('Redis keys count:', keys.length);
  for (const k of keys) {
    const type = await redis.type(k);
    const ttl = await redis.ttl(k);
    let val: any;
    if (type === 'string') {
      val = await redis.get(k);
    }
    console.log(`Key: ${k} (type=${type}, ttl=${ttl}) -> value: ${val}`);
  }
  await redis.quit();
}

main().catch(console.error);
