/**
 * 测试 PostgreSQL 数据库连接
 * 运行: cd server && npx ts-node test-db.ts
 */
import { config } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'node:path';

// 加载环境变量
config({ path: resolve(__dirname, '.env') });

function buildConnectionString(): string | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return databaseUrl;
  }

  const host = process.env.DB_HOST?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME?.trim();
  const port = process.env.DB_PORT?.trim() || '5432';

  if (!host || !user || !password || !database) {
    return null;
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;
}

function maskConnectionString(connectionString: string): string {
  try {
    const parsedUrl = new URL(connectionString);
    if (parsedUrl.password) {
      parsedUrl.password = '****';
    }
    return parsedUrl.toString();
  } catch {
    return connectionString.replace(/:(.*?)@/, ':****@');
  }
}

async function testConnection() {
  console.log('🔍 正在测试数据库连接...\n');

  const connectionString = buildConnectionString();
  
  if (!connectionString) {
    console.error('❌ 错误: 未找到数据库连接配置');
    console.log('请检查 server/.env 文件，至少配置 DATABASE_URL 或 DB_HOST/DB_USER/DB_PASSWORD/DB_NAME');
    process.exit(1);
  }

  console.log('📋 连接信息:');
  // 隐藏密码显示
  const safeUrl = maskConnectionString(connectionString);
  console.log(`   URL: ${safeUrl}\n`);

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false, // Neon 需要
    },
    connectionTimeoutMillis: 10000, // 10 秒超时
  });

  try {
    console.log('⏳ 连接中...');
    await client.connect();
    console.log('✅ 数据库连接成功!\n');

    // 测试查询
    console.log('🔍 执行测试查询...');
    const result = await client.query('SELECT version(), current_database(), current_user');
    
    console.log('📊 数据库信息:');
    console.log(`   版本: ${result.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
    console.log(`   数据库: ${result.rows[0].current_database}`);
    console.log(`   用户: ${result.rows[0].current_user}\n`);

    // 检查现有表
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (tables.rows.length > 0) {
      console.log('📁 已存在的表:');
      tables.rows.forEach((row: any) => console.log(`   - ${row.table_name}`));
    } else {
      console.log('📁 数据库中暂无表（首次运行会自动创建）');
    }

    console.log('\n✨ 所有测试通过! 现在可以运行: npm run dev');

  } catch (err) {
    const error = err as any;
    console.error('\n❌ 连接失败:', error.message);
    
    if (error.code === 'ENOTFOUND') {
      console.log('\n💡 提示: 请检查主机名是否正确');
    } else if (error.code === '28P01') {
      console.log('\n💡 提示: 用户名或密码错误');
    } else if (error.message && error.message.includes('SSL')) {
      console.log('\n💡 提示: SSL 连接出现问题，请确保连接字符串包含 sslmode=require');
    }
    
    process.exit(1);
  } finally {
    await client.end();
  }
}

testConnection();
