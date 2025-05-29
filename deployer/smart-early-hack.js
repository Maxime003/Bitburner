/** @param {NS} ns **/
export async function main(ns) {
    const servers = [
        "n00dles",
        "foodnstuff",
        "sigma-cosmetics",
        "joesguns",
        "nectar-net",
        "hong-fang-tea"
    ];

    // Récupère dynamiquement le serveur sur lequel le script est lancé
    const targetServer = ns.getHostname();
    ns.tprint(`🖥️ Exécution sur le serveur : ${targetServer}`);

    let previousTarget = null;

    while (true) {
        // 🔍 Logs de vérification à chaque tour
        ns.tprint("🔄 Nouveau scan des serveurs...");
        
        let bestTarget = null;
        let bestScore = 0;
        let lowestTarget = null;
        let lowestPercentage = Infinity;
        let weakestTarget = null;
        let highestSecurity = 0;

        // 🔄 On scanne la liste complète des serveurs à chaque boucle
        for (const server of servers) {
            if (ns.hasRootAccess(server)) {
                const currentMoney = ns.getServerMoneyAvailable(server);
                const maxMoney = ns.getServerMaxMoney(server);
                const hackTime = ns.getHackTime(server);
                const securityLevel = ns.getServerSecurityLevel(server);
                const minSecurityLevel = ns.getServerMinSecurityLevel(server);

                // Calcul du rendement par seconde
                const profitPerSecond = (currentMoney / hackTime);

                if (profitPerSecond > bestScore) {
                    bestScore = profitPerSecond;
                    bestTarget = server;
                }

                // Identification du serveur le moins rempli
                const fillPercentage = currentMoney / maxMoney;
                if (fillPercentage < lowestPercentage && currentMoney > 0) {
                    lowestPercentage = fillPercentage;
                    lowestTarget = server;
                }

                // Identification du serveur le plus en danger niveau sécurité
                const securityDiff = securityLevel - minSecurityLevel;
                if (securityDiff > highestSecurity) {
                    highestSecurity = securityDiff;
                    weakestTarget = server;
                }
            }
        }

        if (bestTarget && bestTarget !== previousTarget) {
            ns.tprint(`🔥 Nouvelle cible détectée : ${bestTarget}`);

            // Kill des anciens scripts sur le serveur actuel
            ns.scriptKill("basic-hack.js", targetServer);
            ns.scriptKill("basic-grow.js", targetServer);
            ns.scriptKill("basic-weaken.js", targetServer);

            // Calcul de la RAM disponible sur le serveur actuel
            const maxRam = ns.getServerMaxRam(targetServer) - ns.getServerUsedRam(targetServer);
            const hackScriptRam = ns.getScriptRam("basic-hack.js");
            const growScriptRam = ns.getScriptRam("basic-grow.js");
            const weakenScriptRam = ns.getScriptRam("basic-weaken.js");

            const maxHackThreads = Math.floor(maxRam * 0.6 / hackScriptRam);
            const maxGrowThreads = Math.floor(maxRam * 0.2 / growScriptRam);
            const maxWeakenThreads = Math.floor(maxRam * 0.2 / weakenScriptRam);

            // Lancement des nouveaux scripts sur le serveur actuel
            if (maxHackThreads > 0) {
                ns.tprint(`💸 Hack de ${bestTarget} avec ${maxHackThreads} threads sur ${targetServer}`);
                ns.exec("basic-hack.js", targetServer, maxHackThreads, bestTarget);
            } else {
                ns.tprint(`❌ Pas assez de RAM pour le Hack sur ${targetServer}`);
            }

            if (lowestTarget && maxGrowThreads > 0) {
                ns.tprint(`🌱 Grow de ${lowestTarget} avec ${maxGrowThreads} threads sur ${targetServer}`);
                ns.exec("basic-grow.js", targetServer, maxGrowThreads, lowestTarget);
            } else {
                ns.tprint(`❌ Pas assez de RAM pour le Grow sur ${lowestTarget}`);
            }

            if (weakestTarget && maxWeakenThreads > 0) {
                ns.tprint(`🛡️ Weaken de ${weakestTarget} avec ${maxWeakenThreads} threads sur ${targetServer}`);
                ns.exec("basic-weaken.js", targetServer, maxWeakenThreads, weakestTarget);
            } else {
                ns.tprint(`❌ Pas assez de RAM pour le Weaken sur ${weakestTarget}`);
            }

            // Met à jour la cible précédente
            previousTarget = bestTarget;
        }

        // ✅ Correction : boucle forcée à chaque tour
        await ns.sleep(50000); // 50 secondes avant le prochain scan
    }
}
