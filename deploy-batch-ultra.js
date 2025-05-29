/** @param {NS} ns **/
export async function main(ns) {
    const scripts = {
      hack: "hack-delay.js",
      grow: "grow-delay.js",
      weaken: "weaken-delay.js"
    };
    const batchDelay = 200;
    const activeBatches = new Map(); // Map pour suivre les batchs actifs par cible et serveur
  
    // --- Fonctions Utilitaires ---
  
    function scanAll(current = "home", visited = new Set()) {
      visited.add(current);
      for (const neighbor of ns.scan(current)) {
        if (!visited.has(neighbor)) {
          scanAll(neighbor, visited);
        }
      }
      return [...visited];
    }
  
    function tryRoot(server) {
      if (ns.hasRootAccess(server)) return;
      const ports = ns.getServerNumPortsRequired(server);
      let opened = 0;
      if (ns.fileExists("BruteSSH.exe")) ns.brutessh(server), opened++;
      if (ns.fileExists("FTPCrack.exe")) ns.ftpcrack(server), opened++;
      if (ns.fileExists("relaySMTP.exe")) ns.relaysmtp(server), opened++;
      if (ns.fileExists("HTTPWorm.exe")) ns.httpworm(server), opened++;
      if (ns.fileExists("SQLInject.exe")) ns.sqlinject(server), opened++;
      if (opened >= ports) ns.nuke(server);
    }
  
    function getUltraServers() {
      return ns.getPurchasedServers().filter(s => s.toLowerCase().startsWith("ultra-"));
    }
  
    function getFreeRam(server) {
      return ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    }
  
    function calculateBatchThreads(ns, target, player, hackPercent = 0.25) {
      const server = ns.getServer(target);
      const moneyAvailable = server.moneyAvailable;
      const moneyMax = server.moneyMax;
      const securityLevel = server.hackDifficulty;
      const minSecurityLevel = server.minDifficulty;
  
      if (moneyMax === 0) return null;
  
      const hackAmount = moneyAvailable * hackPercent;
      const hackSecurityIncrease = ns.hackAnalyzeSecurity(ns.hackAnalyzeThreads(target, hackAmount));
      const growSecurityIncrease = ns.growthAnalyzeSecurity(ns.growthAnalyze(target, moneyMax / Math.max(moneyAvailable - hackAmount, 1)));
  
      const hackThreads = Math.ceil(ns.hackAnalyzeThreads(target, hackAmount));
      const growThreads = Math.ceil(ns.growthAnalyze(target, moneyMax / Math.max(moneyAvailable - hackAmount, 1)));
      const weaken1Threads = Math.ceil(hackSecurityIncrease / ns.weakenAnalyze(1));
      const weaken2Threads = Math.ceil(growSecurityIncrease / ns.weakenAnalyze(1));
  
      const tHack = ns.formulas.hacking.hackTime(server, player);
      const tGrow = ns.formulas.hacking.growTime(server, player);
      const tWeaken = ns.formulas.hacking.weakenTime(server, player);
  
      return {
        hackThreads,
        growThreads,
        weaken1Threads,
        weaken2Threads,
        tHack,
        tGrow,
        tWeaken,
        ramNeeded: (hackThreads * ns.getScriptRam(scripts.hack)) +
                   (growThreads * ns.getScriptRam(scripts.grow)) +
                   ((weaken1Threads + weaken2Threads) * ns.getScriptRam(scripts.weaken))
      };
    }
  
    function scoreTarget(ns, target) {
      const server = ns.getServer(target);
      if (server.moneyMax === 0 || server.hackDifficulty > ns.getPlayer().skills.hacking) return -Infinity;
      const timeMultiplier = server.minDifficulty / server.hackDifficulty; // Favorise les serveurs plus faciles
      return server.moneyMax * timeMultiplier / (ns.formulas.hacking.hackTime(server, ns.getPlayer()) + ns.formulas.hacking.growTime(server, ns.getPlayer()) + ns.formulas.hacking.weakenTime(server, ns.getPlayer()));
    }
  
    async function copyScriptsToAll(servers, scriptList) {
      for (const server of servers) {
        await ns.scp(Object.values(scriptList), server, "home");
      }
    }
  
    async function executeBatchOnServer(ns, server, target, threads, delays) {
      const scriptRam = {
        hack: ns.getScriptRam(scripts.hack),
        grow: ns.getScriptRam(scripts.grow),
        weaken: ns.getScriptRam(scripts.weaken)
      };
      let launched = { hack: 0, grow: 0, weaken: 0 };
      let availableRam = getFreeRam(server);
  
      const canLaunchHack = Math.min(threads.hack, Math.floor(availableRam / scriptRam.hack));
      if (canLaunchHack > 0) {
        const pid = ns.exec(scripts.hack, server, canLaunchHack, target, "delay", delays.hack || 0);
        if (pid !== 0) {
          launched.hack = canLaunchHack;
          availableRam -= canLaunchHack * scriptRam.hack;
        }
      }
  
      const canLaunchWeaken = Math.min(threads.weaken, Math.floor(availableRam / scriptRam.weaken));
      if (canLaunchWeaken > 0) {
        const pid = ns.exec(scripts.weaken, server, canLaunchWeaken, target, "delay", delays.weaken || 0);
        if (pid !== 0) {
          launched.weaken = canLaunchWeaken;
          availableRam -= canLaunchWeaken * scriptRam.weaken;
        }
      }
  
      const canLaunchGrow = Math.min(threads.grow, Math.floor(availableRam / scriptRam.grow));
      if (canLaunchGrow > 0) {
        const pid = ns.exec(scripts.grow, server, canLaunchGrow, target, "delay", delays.grow || 0);
        if (pid !== 0) {
          launched.grow = canLaunchGrow;
          availableRam -= canLaunchGrow * scriptRam.grow;
        }
      }
  
      return launched.hack > 0 && launched.grow > 0 && launched.weaken > 0 ? launched : { hack: 0, grow: 0, weaken: 0 };
    }
  
    // --- Main Loop ---
    while (true) {
      const player = ns.getPlayer();
      const ultraServers = getUltraServers();
      if (ultraServers.length === 0) {
        ns.print("Aucun serveur Ultra trouvé. Attente...");
        await ns.sleep(5000);
        continue;
      }
      await copyScriptsToAll(ultraServers, scripts);
      const servers = scanAll();
      const potentialTargets = servers.filter(s => {
        tryRoot(s);
        return ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > 0 && ns.getServerRequiredHackingLevel(s) <= player.skills.hacking;
      });
  
      // Trier les cibles par score (du plus rentable au moins rentable)
      potentialTargets.sort((a, b) => scoreTarget(ns, b) - scoreTarget(ns, a));
  
      const targetsInBatch = new Set(); // Liste des cibles en cours de batch
  
      for (const server of ultraServers) {
        let availableRam = getFreeRam(server);
  
        for (const target of potentialTargets) {
          if (targetsInBatch.has(target)) {
            continue; // Passer à la cible suivante si elle est déjà en cours de batch
          }
  
          const activeBatchOnServerForTarget = Array.from(activeBatches.values()).some(batch => batch.host === server && batch.target === target);
          if (activeBatchOnServerForTarget) {
            continue; // Un batch est déjà actif sur ce serveur pour cette cible
          }
  
          const batchInfo = calculateBatchThreads(ns, target, player);
          if (!batchInfo) continue;
  
          const { hackThreads, growThreads, weaken1Threads, weaken2Threads, tHack, tGrow, tWeaken, ramNeeded } = batchInfo;
  
          if (ramNeeded <= availableRam) {
            const weaken1Delay = 0;
            const hackDelay = Math.max(0, tWeaken - tHack + batchDelay);
            const growDelay = Math.max(0, tWeaken - tGrow + 2 * batchDelay);
            const weaken2Delay = tWeaken + 3 * batchDelay;
  
            const threadsToAllocate = {
              hack: hackThreads,
              grow: growThreads,
              weaken: weaken1Threads + weaken2Threads
            };
            const delays = {
              hack: hackDelay,
              grow: growDelay,
              weaken: weaken1Delay
            };
  
            const launchedThreads = await executeBatchOnServer(ns, server, target, threadsToAllocate, delays);
            const totalLaunchedRam = launchedThreads.hack * ns.getScriptRam(scripts.hack) + launchedThreads.grow * ns.getScriptRam(scripts.grow) + launchedThreads.weaken * ns.getScriptRam(scripts.weaken);
  
            if (launchedThreads.hack > 0 && launchedThreads.grow > 0 && launchedThreads.weaken > 0) {
              activeBatches.set(target, { startTime: Date.now(), weakenTime: tWeaken, host: server, target: target });
              targetsInBatch.add(target); // Ajouter la cible à la liste des cibles en batch
              availableRam -= totalLaunchedRam;
              //ns.tprint(`🎯 Batch HWGW lancé sur ${target} sur ${server} (RAM utilisé: ${ns.formatRam(totalLaunchedRam)}) | H:${launchedThreads.hack} G:${launchedThreads.grow} W:${launchedThreads.weaken}`);
              // Tenter de lancer un autre batch sur le même serveur si la RAM le permet
            } else {
              ns.print(`❌ Impossible de lancer un batch complet sur ${target} sur ${server}.`);
            }
          } else {
            // Plus assez de RAM sur ce serveur pour un batch complet pour cette cible, passer à la cible suivante
          }
        }
      }
  
      // Nettoyer les batchs terminés et mettre à jour la liste des cibles en batch
      for (const [batchTarget, batchInfo] of activeBatches.entries()) {
        if (Date.now() > batchInfo.startTime + batchInfo.weakenTime + 15000) {
          activeBatches.delete(batchTarget);
          targetsInBatch.delete(batchTarget); // Supprimer la cible de la liste quand le batch est terminé
          ns.print(`✅ Batch terminé pour ${batchTarget} sur ${batchInfo.host}.`);
        }
      }
  
      await ns.sleep(500);
    }
  
    async function executeBatchOnServer(ns, server, target, threads, delays) {
      const scriptRam = {
        hack: ns.getScriptRam(scripts.hack),
        grow: ns.getScriptRam(scripts.grow),
        weaken: ns.getScriptRam(scripts.weaken)
      };
      let launched = { hack: 0, grow: 0, weaken: 0 };
      let availableRam = getFreeRam(server);
  
      const canLaunchHack = Math.min(threads.hack, Math.floor(availableRam / scriptRam.hack));
      if (canLaunchHack > 0) {
        const pid = ns.exec(scripts.hack, server, canLaunchHack, target, "delay", delays.hack || 0);
        if (pid !== 0) {
          launched.hack = canLaunchHack;
          availableRam -= canLaunchHack * scriptRam.hack;
        }
      }
  
      const canLaunchWeaken = Math.min(threads.weaken, Math.floor(availableRam / scriptRam.weaken));
      if (canLaunchWeaken > 0) {
        const pid = ns.exec(scripts.weaken, server, canLaunchWeaken, target, "delay", delays.weaken || 0);
        if (pid !== 0) {
          launched.weaken = canLaunchWeaken;
          availableRam -= canLaunchWeaken * scriptRam.weaken;
        }
      }
  
      const canLaunchGrow = Math.min(threads.grow, Math.floor(availableRam / scriptRam.grow));
      if (canLaunchGrow > 0) {
        const pid = ns.exec(scripts.grow, server, canLaunchGrow, target, "delay", delays.grow || 0);
        if (pid !== 0) {
          launched.grow = canLaunchGrow;
          availableRam -= canLaunchGrow * scriptRam.grow;
        }
      }
  
      return launched.hack > 0 && launched.grow > 0 && launched.weaken > 0 ? launched : { hack: 0, grow: 0, weaken: 0 };
    }
  }