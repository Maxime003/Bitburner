/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0]; // Le nom du serveur à supprimer

    if (!target) {
        ns.tprint("❌ Utilisation : run delete-target-server.js [nom_du_serveur]");
        return;
    }

    // Vérifie que le serveur est bien un serveur personnel
    const purchased = ns.getPurchasedServers();
    if (!purchased.includes(target)) {
        ns.tprint(`❌ Le serveur "${target}" n'est pas un serveur personnel que tu possèdes.`);
        return;
    }

    // Tente de tuer tous les scripts actifs
    ns.killall(target);

    // Petite pause pour être sûr que tout est arrêté
    await ns.sleep(200);

    // Tente de le supprimer
    const success = ns.deleteServer(target);
    if (success) {
        ns.tprint(`✅ Le serveur "${target}" a été supprimé avec succès.`);
    } else {
        ns.tprint(`❌ Impossible de supprimer le serveur "${target}". Des scripts y tournent peut-être encore.`);
    }
}
