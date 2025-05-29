/** @param {NS} ns **/
export async function main(ns) {
    const args = ns.args;

    if (args.length === 0) {
        ns.tprint("❌ Utilisation : run auto-copy.js script1.js script2.js serveur1 serveur2 ...");
        return;
    }

    // On sépare les scripts des serveurs en analysant l'extension
    const scripts = args.filter(arg => arg.endsWith(".js"));
    const servers = args.filter(arg => !arg.endsWith(".js"));

    if (scripts.length === 0 || servers.length === 0) {
        ns.tprint("❌ Il faut au moins un script .js et un nom de serveur.");
        return;
    }

    for (const server of servers) {
        await ns.scp(scripts, server);
        ns.tprint(`✅ Copié ${scripts.length} script(s) vers ${server}`);
    }
}
