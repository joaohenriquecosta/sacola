const { exec } = require("node:child_process");

console.log("\n⏳ Aguardando Postgres aceitar conexões...\n");
check();

function check() {
  exec("docker exec sacola_postgres pg_isready --host localhost", (_error, stdout) => {
    if (!stdout.includes("accepting connections")) {
      process.stdout.write("▫️");
      check();
      return;
    }
    console.log("\n\n✅ Postgres pronto.\n");
  });
}
