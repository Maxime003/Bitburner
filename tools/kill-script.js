/** @param {NS} ns **/
export async function main(ns) {
    // Liste de tous les serveurs achetés
    const servers = ns.getPurchasedServers();

    // Filtre uniquement ceux qui commencent par "Ultra-"
    const ultraServers = servers.filter(s => s.startsWith("hack-"));

    if (ultraServers.length === 0) {
        ns.tprint("❌ Aucun serveur commençant par 'Ultra-' trouvé.");
        return;
    }

    for (const server of ultraServers) {
        ns.killall(server);
        ns.tprint(`☠️  Tous les scripts ont été tués sur ${server}`);
    }

    ns.tprint(`✅ Nettoyage terminé sur ${ultraServers.length} serveur(s).`);
}
