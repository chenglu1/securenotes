/**
 * 检查本地 SQLite 数据库内容
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function checkDatabase() {
  const SQL = await initSqlJs();
  
  // 数据库文件路径
  const dbPath = path.join(
    process.env.APPDATA || process.env.HOME, 
    'securenotes',
    'securenotes.db'
  );
  
  console.log('📁 数据库路径:', dbPath);
  console.log('📊 文件大小:', (fs.statSync(dbPath).size / 1024).toFixed(2), 'KB\n');
  
  // 读取数据库
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  // 查询笔记
  console.log('📝 笔记列表:\n');
  const notes = db.exec('SELECT id, title, content, created_at, updated_at FROM notes ORDER BY created_at DESC');
  
  if (notes.length > 0 && notes[0].values.length > 0) {
    notes[0].values.forEach((row, index) => {
      console.log(`${index + 1}. 标题: ${row[1]}`);
      console.log(`   内容: ${row[2].substring(0, 100)}${row[2].length > 100 ? '...' : ''}`);
      console.log(`   创建时间: ${row[3]}`);
      console.log(`   更新时间: ${row[4]}`);
      console.log(`   ID: ${row[0]}\n`);
    });
    console.log(`✅ 共找到 ${notes[0].values.length} 条笔记`);
  } else {
    console.log('❌ 数据库中没有笔记');
  }
  
  // 查询标签
  const tags = db.exec('SELECT * FROM tags');
  console.log(`\n🏷️  标签数量: ${tags.length > 0 ? tags[0].values.length : 0}`);
  
  db.close();
}

checkDatabase().catch(console.error);
