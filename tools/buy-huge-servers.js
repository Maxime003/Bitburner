/** @param {NS} ns **/
export async function main(ns) {
    // Configuration
    const ram = 1024 * 1024; // RAM en Go => 1Po
    const count = 25; // Nombre de serveurs à acheter
    const prefix = "Ultra-";
    const scriptsToCopy = ["hack-delay.js", "grow-delay.js", "weaken-delay.js", "deploy-smart-hwgw.js"];

    // Vérification que les scripts existent
    for (const script of scriptsToCopy) {
        if (!ns.fileExists(script, "home")) {
            ns.tprint(`❌ Script manquant sur home : ${script}`);
            return;
        }
    }

    const cost = ns.getPurchasedServerCost(ram);
    ns.tprint(`💰 Coûts par serveur (${ram} Go) : ${ns.formatNumber(cost, "0.00a")}`);
    ns.tprint(`🛒 Achat de ${count} serveurs pour ${ns.formatNumber(cost * count, "0.00a")} au total.`);

    let purchased = 0;
    for (let i = 1; i <= count; i++) {
        const hostname = `${prefix}${i}`;

        // Ne rien faire si le serveur existe déjà
        if (ns.serverExists(hostname)) {
            ns.tprint(`⚠️ Serveur ${hostname} existe déjà. Ignoré.`);
            continue;
        }

        // Achat
        const server = ns.purchaseServer(hostname, ram);
        if (server) {
            ns.tprint(`✅ Serveur acheté : ${server}`);
            // Copie des scripts
            await ns.scp(scriptsToCopy, server, "home");
            ns.tprint(`📦 Scripts copiés sur ${server}`);
            purchased++;
        } else {
            ns.tprint(`❌ Échec de l'achat du serveur ${hostname}`);
            break;
        }
    }

    ns.tprint(`🎉 Achat terminé : ${purchased} serveur(s) acheté(s).`);
}
