/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    ns.tail();
    ns.print("--- Démarrage de Batch-Home v3 (Répartition Cibles) ---");

    const scripts = {
        hack: "hack-home-delay.js",
        grow: "grow-home-delay.js",
        weaken: "weaken-home-delay.js",
    };
    const hostServer = "home"; // On n'utilise QUE home
    const batchSpacing = 400;
    const safetyMargin = 1000;
    const hackPercent = 0.50;
    const prepBuffer = 1.05;
    const homeRamReserve = 512;
    const minRamForBatch = 100; // Minimum RAM pour tenter de lancer

    const ramCosts = {
        hack: ns.getScriptRam(scripts.hack),
        grow: ns.getScriptRam(scripts.grow),
        weaken: ns.getScriptRam(scripts.weaken),
    };

    // Vérifications (inchangées)
    for (const scriptName of Object.values(scripts)) {
        if (!ns.fileExists(scriptName, hostServer)) { ns.tprint(`ERREUR: ${scriptName} manquant !`); ns.exit(); }
    }
    if (!ns.fileExists("Formulas.exe", "home")) { ns.tprint(`ERREUR: Formulas.exe manquant !`); ns.exit(); }

    // --- Fonctions Utilitaires (inchangées) ---
    function scanAll(current = "home", visited = new Set()) { /* ... */ 
        visited.add(current);
        ns.scan(current).forEach(neighbor => {
            if (!visited.has(neighbor)) scanAll(neighbor, visited);
        });
        return [...visited];
    }
    function tryRoot(serverName) { /* ... */ 
        if (ns.hasRootAccess(serverName) || serverName === "home") return true;
        try {
            const portsRequired = ns.getServerNumPortsRequired(serverName);
            let openedPorts = 0;
            if (ns.fileExists("BruteSSH.exe", "home")) { ns.brutessh(serverName); openedPorts++; }
            if (ns.fileExists("FTPCrack.exe", "home")) { ns.ftpcrack(serverName); openedPorts++; }
            if (ns.fileExists("relaySMTP.exe", "home")) { ns.relaysmtp(serverName); openedPorts++; }
            if (ns.fileExists("HTTPWorm.exe", "home")) { ns.httpworm(serverName); openedPorts++; }
            if (ns.fileExists("SQLInject.exe", "home")) { ns.sqlinject(serverName); openedPorts++; }
            if (openedPorts >= portsRequired) { ns.nuke(serverName); }
        } catch (e) { return false; }
        return ns.hasRootAccess(serverName);
    }
    function getFreeRam(serverName) { /* ... */ 
        return ns.getServerMaxRam(serverName) - ns.getServerUsedRam(serverName) - (serverName === "home" ? homeRamReserve : 0);
    }
    function scoreTarget(ns, target) { /* ... */ 
        const server = ns.getServer(target);
        if (server.moneyMax === 0 || !ns.hasRootAccess(target)) return 0;
        return server.moneyMax / ns.formulas.hacking.weakenTime(server, ns.getPlayer());
    }
    function needsPrep(ns, target) { /* ... */ 
         const server = ns.getServer(target);
        return server.hackDifficulty > server.minDifficulty + 0.05 ||
               server.moneyAvailable < server.moneyMax * 0.99;
    }

    // Utilise la version non-bloquante de prepServer, mais lance depuis 'home'
    async function prepServer(ns, target) { /* ... (presque inchangé, mais lance depuis 'home') ... */
        ns.print(`INFO: Lancement prépa pour ${target} depuis ${hostServer}...`);
        let server = ns.getServer(target);
        const player = ns.getPlayer();
        const tWeaken = ns.formulas.hacking.weakenTime(server, player);
        const tGrow = ns.formulas.hacking.growTime(server, player);
        let delayOffset = 0;
        let totalRamNeeded = 0;
        let scriptsToLaunch = [];

        const weaken1Threads = Math.ceil((server.hackDifficulty - server.minDifficulty) / ns.weakenAnalyze(1));
        if (weaken1Threads > 0) {
            totalRamNeeded += weaken1Threads * ramCosts.weaken;
            scriptsToLaunch.push({ s: scripts.weaken, t: weaken1Threads, d: delayOffset, id: "-prepW1-" });
            delayOffset += tWeaken + batchSpacing;
        }

        let serverForGrow = ns.getServer(target); serverForGrow.hackDifficulty = serverForGrow.minDifficulty;
        const growThreads = Math.ceil(ns.growthAnalyze(target, (serverForGrow.moneyMax / Math.max(1, serverForGrow.moneyAvailable)) * prepBuffer, 1));
        if (growThreads > 0) {
            const weaken2Threads = Math.ceil(ns.growthAnalyzeSecurity(growThreads) / ns.weakenAnalyze(1));
            totalRamNeeded += growThreads * ramCosts.grow;
            totalRamNeeded += weaken2Threads * ramCosts.weaken;
            scriptsToLaunch.push({ s: scripts.grow, t: growThreads, d: delayOffset, id: "-prepG-" });
            delayOffset += tGrow + batchSpacing;
            scriptsToLaunch.push({ s: scripts.weaken, t: weaken2Threads, d: delayOffset, id: "-prepW2-" });
            delayOffset += tWeaken + batchSpacing;
        }

        if (scriptsToLaunch.length === 0) { return 1000; }
        if (getFreeRam(hostServer) < totalRamNeeded) { ns.print(`WARN: Pas assez de RAM sur ${hostServer} pour préparer ${target}.`); return 0; }

        for (const script of scriptsToLaunch) {
            if (ns.exec(script.s, hostServer, script.t, target, script.d, `${target}${script.id}${Date.now()}`) === 0) {
                ns.print(`ERROR: Échec lancement ${script.id} sur ${hostServer}.`); return 0;
            }
        }
        return delayOffset + safetyMargin;
    }

    function calculateHWGWThreads(ns, target, player) { /* ... (inchangé) ... */ 
        let server = ns.getServer(target); server.hackDifficulty = server.minDifficulty; server.moneyAvailable = server.moneyMax;
        if (server.moneyMax === 0) return null;
        const hackAmount = server.moneyAvailable * hackPercent;
        const hackThreads = Math.floor(ns.hackAnalyzeThreads(target, hackAmount)); if (hackThreads <= 0) return null;
        const securityIncreaseHack = ns.hackAnalyzeSecurity(hackThreads);
        const growMultiplier = server.moneyMax / Math.max(1, server.moneyMax - hackAmount);
        const growThreads = Math.ceil(ns.growthAnalyze(target, growMultiplier, 1));
        const securityIncreaseGrow = ns.growthAnalyzeSecurity(growThreads);
        const weaken1Threads = Math.ceil(securityIncreaseHack / ns.weakenAnalyze(1));
        const weaken2Threads = Math.ceil(securityIncreaseGrow / ns.weakenAnalyze(1));
        const ramNeeded = (hackThreads * ramCosts.hack) + (growThreads * ramCosts.grow) + ((weaken1Threads + weaken2Threads) * ramCosts.weaken);
        const tHack = ns.formulas.hacking.hackTime(server, player); const tGrow = ns.formulas.hacking.growTime(server, player); const tWeaken = ns.formulas.hacking.weakenTime(server, player);
        const delays = { H: tWeaken + batchSpacing - tHack, W1: 0, G: tWeaken + 2 * batchSpacing - tGrow, W2: 3 * batchSpacing };
        if (delays.H < 0 || delays.G < 0) { return null; }
        return { threads: { H: hackThreads, W1: weaken1Threads, G: growThreads, W2: weaken2Threads }, delays: delays, ram: ramNeeded, tWeaken: tWeaken };
    }
    
    async function launchBatch(ns, host, target, batchInfo, stagger) { /* ... (inchangé) ... */
        const { threads, delays } = batchInfo; const batchId = `${target}-${host}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const pids = {};
        pids.W1 = ns.exec(scripts.weaken, host, threads.W1, target, delays.W1 + stagger, batchId + "-W1");
        pids.W2 = ns.exec(scripts.weaken, host, threads.W2, target, delays.W2 + stagger, batchId + "-W2");
        pids.G = ns.exec(scripts.grow, host, threads.G, target, delays.G + stagger, batchId + "-G");
        pids.H = ns.exec(scripts.hack, host, threads.H, target, delays.H + stagger, batchId + "-H");
        if (pids.W1 === 0 || pids.W2 === 0 || pids.G === 0 || pids.H === 0) {
            Object.values(pids).forEach(pid => { if (pid !== 0) ns.kill(pid); }); return false;
        }
        return true;
     }

    // --- Boucle Principale (Révisée pour Répartition Cibles) ---
    const activeTargets = new Map(); // target => { endTime, type, staggerCount }

    while (true) {
        const player = ns.getPlayer();
        const allServers = scanAll().filter(s => s !== "home");
        const potentialTargets = allServers.filter(serverName => {
            return tryRoot(serverName) &&
                   ns.getServerMaxMoney(serverName) > 0 &&
                   ns.getServerRequiredHackingLevel(serverName) <= player.skills.hacking;
        });
        potentialTargets.sort((a, b) => scoreTarget(ns, b) - scoreTarget(ns, a));

        // Nettoyer cibles terminées
        for (const [target, info] of activeTargets.entries()) {
            if (Date.now() > info.endTime) activeTargets.delete(target);
        }

        // --- Phase 1: Préparation (comme avant, mais lance depuis 'home') ---
        for (const target of potentialTargets) {
            if (activeTargets.has(target)) continue; // Déjà géré (prep ou batch)
            if (needsPrep(ns, target)) {
                const prepDuration = await prepServer(ns, target);
                if (prepDuration > 0) {
                    activeTargets.set(target, { endTime: Date.now() + prepDuration, type: "prep", staggerCount: 0 });
                    ns.print(`⏳ ${target} en préparation (${ns.tFormat(prepDuration)})`);
                } // Si 0, pas assez de RAM, on réessaiera
                // On ne met pas 'continue' pour pouvoir tenter d'autres prep si RAM ok
            }
             await ns.sleep(10); // Laisse le CPU respirer
        }

        // --- Phase 2: Lancement en Boucle (Répartition Cibles) ---
        let launchedInCycle = true;
        while (launchedInCycle) { // Tant qu'on arrive à lancer des choses...
            launchedInCycle = false;

            if (getFreeRam(hostServer) < minRamForBatch) {
                ns.print(`INFO: RAM faible, pause lancement.`);
                break; // Sortir si RAM trop faible
            }

            for (const target of potentialTargets) {
                // Sauter si besoin de prep, ou en cours de prep, ou si la RAM est trop basse
                if (needsPrep(ns, target) || activeTargets.get(target)?.type === 'prep') continue;
                
                const batchInfo = calculateHWGWThreads(ns, target, player);
                if (!batchInfo || batchInfo.ram <= 0 || getFreeRam(hostServer) < batchInfo.ram) {
                    continue; // Impossible de lancer ce batch
                }

                // Si on peut lancer, on lance UN batch pour cette cible
                const currentData = activeTargets.get(target) || { endTime: 0, type: "batch", staggerCount: 0 };
                const stagger = currentData.staggerCount * batchSpacing * 4;

                if (await launchBatch(ns, hostServer, target, batchInfo, stagger)) {
                    launchedInCycle = true; // On a réussi à lancer, on fera un autre tour

                    const newCount = currentData.staggerCount + 1;
                    const batchDuration = batchInfo.tWeaken + 3 * batchSpacing + stagger;
                    const endTime = Date.now() + batchDuration + safetyMargin;

                    activeTargets.set(target, {
                        endTime: Math.max(currentData.endTime, endTime),
                        type: "batch",
                        staggerCount: newCount
                    });
                    ns.print(`🎯 Batch #${newCount} lancé sur ${target}.`);
                    await ns.sleep(50); // Petite pause pour ne pas saturer ns.exec et laisser le temps de MAJ RAM
                } else {
                    ns.print(`ERROR: Échec lancement batch sur ${target}. RAM pleine ?`);
                    await ns.sleep(100); // Pause un peu plus longue si échec
                    launchedInCycle = false; // Arrêter la boucle si ns.exec échoue
                    break;
                }
                
                // Si la RAM devient faible, on arrête ce cycle pour la boucle while puisse rechecker
                if (getFreeRam(hostServer) < minRamForBatch) break;
            } // Fin boucle for targets
        } // Fin boucle while launchedInCycle

        await ns.sleep(1000); // Attendre 1 seconde avant le prochain grand cycle
    }
}