import sqlite3 from 'sqlite3';

function runTest() {
  console.log('Testing sqlite3 native binding...');
  try {
    const db = new sqlite3.Database(':memory:');
    
    db.serialize(() => {
      db.run(`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)`);
      
      const stmt = db.prepare(`INSERT INTO test (name) VALUES (?)`);
      stmt.run('hello');
      stmt.finalize();

      db.all(`SELECT * FROM test`, (err, rows) => {
        if (err) {
          console.error('Test failed:', err.message);
          process.exit(1);
        } else {
          console.log('Test successful:', rows);
          db.close();
        }
      });
    });
  } catch (err: any) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}

runTest();
