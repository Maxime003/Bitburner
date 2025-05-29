/** @param {NS} ns **/
export async function main(ns) {
    const ram = ns.args[0];
    const name = ns.args[1];
  
    if (!ram || ram < 1 || !Number.isInteger(ram)) {
      ns.tprint("❌ indique une RAM valide ! Exemple : run buy-server.js 8 hack-1");
      return;
    }
  
    const cost = ns.getPurchasedServerCost(ram);
  
    if (ns.getServerMoneyAvailable("home") < cost) {
      ns.tprint(`❌ T'as pas les sous mon frère. Il te faut ${ns.formatNumber(cost, "0.0a")} $`);
      return; // <-- on arrête ici
    }
  
    const hostname = name || `server-${ram}GB-${Date.now()}`;
    const server = ns.purchaseServer(hostname, ram);
  
    if (server) {
      ns.tprint(`✅ Serveur ${server} avec ${ram}GB acheté ma gueule`);
    } else {
      ns.tprint("❌ Ah zut ! Achat échoué");
    }
  }
  