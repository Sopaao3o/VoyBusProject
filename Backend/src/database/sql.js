/** Ejecuta una lista de sentencias SQL, una por una (SQLite no admite varias en una sola consulta). */
async function ejecutar(queryInterface, sentencias) {
  for (const sql of sentencias) await queryInterface.sequelize.query(sql);
}

module.exports = { ejecutar };
