/** @param {NS} ns **/
export async function main(ns) {
    const hostServer = ns.getHostname(); // Renommé pour éviter la confusion avec les serveurs cibles
    const hackScriptRam = ns.getScriptRam("basic-hack.js");
    const growScriptRam = ns.getScriptRam("basic-grow.js");
    const weakenScriptRam = ns.getScriptRam("basic-weaken.js");

    // Vérification que les scripts de base existent
    if (hackScriptRam === 0 || growScriptRam === 0 || weakenScriptRam === 0) {
        ns.tprint("❌ Erreur : Un ou plusieurs scripts de base (basic-hack.js, basic-grow.js, basic-weaken.js) n'ont pas été trouvés ou ont une RAM de 0. Assurez-vous qu'ils existent sur 'home'.");
        return;
    }

    while (true) {
        // Scan du réseau et récupération des cibles rentables
        const servers = scanNetwork(ns);
        let targets = [];
        const currentHackingLevel = ns.getHackingLevel();

        for (const server of servers) {
            // On s'assure de ne pas s'attaquer soi-même ou aux serveurs achetés
            if (server === "home" || ns.getPurchasedServers().includes(server)) {
                continue;
            }

            const requiredLevel = ns.getServerRequiredHackingLevel(server);

            if (ns.hasRootAccess(server) &&
                ns.getServerMaxMoney(server) > 0 &&
                requiredLevel <= currentHackingLevel) {

                const maxMoney = ns.getServerMaxMoney(server);

                // Calculs SANS Formulas.exe
                const hackTime = ns.getHackTime(server);
                const growTime = ns.getGrowTime(server);
                const weakenTime = ns.getWeakenTime(server);

                // Calcul du rendement par seconde (estimation)
                const totalCycleTime = hackTime + growTime + weakenTime;
                // Gérer le cas où le temps total est 0 (peut arriver sur des serveurs très faibles)
                const profitPerSecond = totalCycleTime > 0 ? maxMoney / totalCycleTime : 0;

                // Calcul des écarts
                const currentSecurity = ns.getServerSecurityLevel(server);
                const minSecurity = ns.getServerMinSecurityLevel(server);
                const securityDiff = currentSecurity - minSecurity;

                const currentMoney = ns.getServerMoneyAvailable(server);
                const moneyDiff = maxMoney - currentMoney;

                // Calcul d'un score basé sur les trois paramètres
                // On pondère plus fortement la rentabilité et la nécessité de baisser la sécurité.
                const score = (profitPerSecond * 1.5) + (moneyDiff * 0.5) - (securityDiff * 2.0);

                targets.push({ server, score });
            }
        }

        // Trier les cibles par score décroissant
        targets.sort((a, b) => b.score - a.score);

        if (targets.length === 0) {
            ns.tprint("⏳ Aucune cible rentable et accessible trouvée pour le moment. Prochain scan dans 30s.");
            await ns.sleep(30000);
            continue;
        }

        // Sélection des 3 meilleures cibles (ou moins s'il n'y en a pas 3)
        const bestTargets = targets.slice(0, 3);
        const bestServers = bestTargets.map(t => t.server); // Obtenir juste les noms

        let targetWeaken = bestServers[0];
        let targetGrow = bestServers[0];
        let targetHack = bestServers[0]; // Par défaut, on prend le meilleur score

        // Logique de sélection améliorée :
        // Weaken : Cible avec la plus HAUTE sécurité actuelle parmi les meilleures
        // Grow : Cible avec le plus BAS % d'argent actuel parmi les meilleures
        // Hack : Cible avec le MEILLEUR score (déjà la première)

        let maxSec = -1;
        let minMoneyRatio = 2; // Ratio > 1

        for (const srv of bestServers) {
            const currentSec = ns.getServerSecurityLevel(srv);
            const currentMon = ns.getServerMoneyAvailable(srv);
            const maxMon = ns.getServerMaxMoney(srv);
            const moneyRatio = maxMon > 0 ? currentMon / maxMon : 0;

            if (currentSec > maxSec) {
                maxSec = currentSec;
                targetWeaken = srv;
            }
            if (moneyRatio < minMoneyRatio) {
                minMoneyRatio = moneyRatio;
                targetGrow = srv;
            }
        }

        // Si la sécurité de la cible Weaken est proche du minimum, on peut aussi Weaken la cible Grow/Hack
        if ((ns.getServerSecurityLevel(targetWeaken) - ns.getServerMinSecurityLevel(targetWeaken)) < 5) {
            targetWeaken = targetHack;
        }
        // Si la cible Grow est presque pleine, on peut aussi Grow la cible Hack
        if ((ns.getServerMaxMoney(targetGrow) - ns.getServerMoneyAvailable(targetGrow)) < (ns.getServerMaxMoney(targetGrow) * 0.1)) {
           targetGrow = targetHack;
        }

        // ns.tprint(`🎯 Cibles choisies : Weaken=${targetWeaken}, Grow=${targetGrow}, Hack=${targetHack}`);

        // Calcul des threads optimisés sur le serveur HÔTE
        let availableRam = ns.getServerMaxRam(hostServer) - ns.getServerUsedRam(hostServer);

        if (availableRam > (hackScriptRam + growScriptRam + weakenScriptRam)) { // Garder une petite marge
            // Distribution dynamique basée sur les besoins ? Pour l'instant, on garde la répartition fixe.
            const ramForHack = availableRam * 0.4;
            const ramForGrow = availableRam * 0.3;
            const ramForWeaken = availableRam * 0.3;

            const hackThreads = Math.floor(ramForHack / hackScriptRam);
            const growThreads = Math.floor(ramForGrow / growScriptRam);
            const weakenThreads = Math.floor(ramForWeaken / weakenScriptRam);

            // Lancement des scripts sur les cibles optimisées
            if (hackThreads > 0) ns.exec("basic-hack.js", hostServer, hackThreads, targetHack);
            if (growThreads > 0) ns.exec("basic-grow.js", hostServer, growThreads, targetGrow);
            if (weakenThreads > 0) ns.exec("basic-weaken.js", hostServer, weakenThreads, targetWeaken);
        } else {
            // ns.tprint(`📉 RAM insuffisante sur ${hostServer} pour lancer de nouveaux scripts.`);
        }

        // Pause avant le prochain scan
        await ns.sleep(30000); // 30 secondes, ajustable
    }
}

// Fonction pour scanner tout le réseau (inchangée)
function scanNetwork(ns) {
    const serversToScan = ["home"];
    const scannedServers = new Set();
    while (serversToScan.length > 0) {
        const server = serversToScan.pop();
        if (!scannedServers.has(server)) {
            scannedServers.add(server);
            const neighbors = ns.scan(server);
            for (const neighbor of neighbors) {
                if (!scannedServers.has(neighbor)) {
                    serversToScan.push(neighbor);
                }
            }
        }
    }
    return [...scannedServers];
}