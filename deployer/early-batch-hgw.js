/** @param {NS} ns **/
export async function main(ns) {
  const scripts = {
    hack: "hack-delay.js",
    grow: "grow-delay.js",
    weaken: "weaken-delay.js"
  };
  const batchDelay = 200; // Délai entre la fin de chaque opération dans un batch (ms)
  const activeBatches = new Map(); // Suivi des batchs actifs: target => { startTime, weakenTime, host, target }

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
    if (ns.fileExists("BruteSSH.exe", "home")) { ns.brutessh(server); opened++; }
    if (ns.fileExists("FTPCrack.exe", "home")) { ns.ftpcrack(server); opened++; }
    if (ns.fileExists("relaySMTP.exe", "home")) { ns.relaysmtp(server); opened++; }
    if (ns.fileExists("HTTPWorm.exe", "home")) { ns.httpworm(server); opened++; }
    if (ns.fileExists("SQLInject.exe", "home")) { ns.sqlinject(server); opened++; }
    if (opened >= ports) ns.nuke(server);
  }

  function getWorkerServers() {
    let workers = ns.getPurchasedServers().filter(s => s.toLowerCase().startsWith("ultra-"));
    if (workers.length === 0) {
        workers = ns.getPurchasedServers(); // Utiliser tous les serveurs achetés si aucun "ultra-"
    }
    if (workers.length === 0 && ns.getServerMaxRam("home") > 32) { // Seuil arbitraire pour home
        // Ajouter home comme worker si peu ou pas de serveurs achetés et assez de RAM
        // Attention: les scripts sur home peuvent impacter vos performances manuelles
        // workers.push("home"); // Décommentez avec prudence
    }
    if (workers.length === 0) {
        ns.print("WARN: Aucun serveur 'ultra-' ou autre serveur acheté trouvé. Utilisation de 'home' si RAM suffisante.");
        if (ns.getServerMaxRam("home") > Math.max(ns.getScriptRam(scripts.hack), ns.getScriptRam(scripts.grow), ns.getScriptRam(scripts.weaken)) * 5) { // Ensure home has some minimal RAM
            // workers.push("home"); // Consider adding home as a last resort. Ensure enough free RAM.
            ns.tprint("INFO: 'home' sera potentiellement utilisé comme serveur de travail. Assurez-vous d'avoir assez de RAM libre.");
        }
    }
    return workers;
  }

  function getFreeRam(server) {
    return ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
  }

  function calculateBatchThreads(ns, target, hackPercent = 0.25) {
    // Note: Sans Formulas.exe, getServer() est utilisé pour obtenir les infos serveur,
    // et les temps sont basés sur l'état actuel du joueur et du serveur.
    const serverInfo = ns.getServer(target); // On récupère l'objet serveur une fois.
    const moneyAvailable = serverInfo.moneyAvailable;
    const moneyMax = serverInfo.moneyMax;

    if (moneyMax === 0) return null; // Cible inutile si elle ne peut pas stocker d'argent

    // Calcul des threads nécessaires
    let hackAmount = moneyAvailable * hackPercent;
    if (hackAmount <= 0 && moneyAvailable > 0) { // Si hackPercent est trop petit vs moneyAvailable
        hackAmount = moneyAvailable > 1 ? moneyAvailable * 0.01 : moneyAvailable; // Prendre un petit montant pour démarrer
    }
    if (moneyAvailable === 0 && moneyMax > 0) { // Si le serveur est vide mais peut contenir de l'argent -> pas de hack initial
        hackAmount = 0;
    }


    const hackThreads = hackAmount > 0 ? Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, hackAmount))) : 0;

    let growRatio = 1; // Ratio par défaut si pas besoin de grow
    if (moneyAvailable < moneyMax) {
        const moneyToGrow = moneyMax - (moneyAvailable - hackAmount);
        if (moneyToGrow <= 0) { // Si le hack vide plus que ce qu'il y a
             growRatio = moneyMax / Math.max(1, 1); // Viser le max à partir de 1$ (ou d'une petite base)
        } else {
             growRatio = moneyMax / Math.max(1, moneyAvailable - hackAmount);
        }
    }
     // S'assurer que le ratio n'est pas absurde (ex: Infinity si moneyAvailable - hackAmount est 0 ou négatif)
    if (!isFinite(growRatio) || growRatio < 1) growRatio = 1.1; //Vise une petite croissance si le calcul est problématique ou si déjà max (pour la sécurité)


    const growThreads = moneyAvailable < moneyMax || hackThreads > 0 ? Math.max(1, Math.ceil(ns.growthAnalyze(target, growRatio, ns.getServer(target).cpuCores))) : 0;

    // Calcul de l'augmentation de sécurité
    const hackSecurityIncrease = hackThreads > 0 ? ns.hackAnalyzeSecurity(hackThreads, target) : 0;
    const growSecurityIncrease = growThreads > 0 ? ns.growthAnalyzeSecurity(growThreads, target, ns.getServer(target).cpuCores) : 0; // growthAnalyzeSecurity(threads, hostname, cores)

    // Threads de weaken pour contrer hack et grow
    // ns.weakenAnalyze(threads, cores) retourne la réduction de sécurité
    // On veut: reduction = hackSecurityIncrease. Donc threads = hackSecurityIncrease / reduction_par_thread
    // reduction_par_thread pour 1 thread et les cores actuels (implicitement ceux de home où tourne ce script)
    // C'est une approximation, car weakenAnalyze devrait utiliser les cores du serveur où le weaken sera lancé.
    // Pour simplifier sans Formulas.exe, on utilise ns.weakenAnalyze(1) qui utilise les cores du serveur où CE script tourne (home)
    // Si on veut être plus précis, il faudrait passer les cores du serveur HOST dans cette fonction
    // Mais pour early game, ns.weakenAnalyze(1) est suffisant.
    const weakenReductionPerThread = ns.weakenAnalyze(1, ns.getServer(target).cpuCores); // Réduction par thread sur la cible avec ses propres cores
    
    const weaken1Threads = hackSecurityIncrease > 0 ? Math.max(1,Math.ceil(hackSecurityIncrease / weakenReductionPerThread)) : 0;
    const weaken2Threads = growSecurityIncrease > 0 ? Math.max(1,Math.ceil(growSecurityIncrease / weakenReductionPerThread)) : 0;

    // Temps d'exécution (sans Formulas.exe)
    const tHack = ns.getHackTime(target);
    const tGrow = ns.getGrowTime(target);
    const tWeaken = ns.getWeakenTime(target);

    const totalWeakenThreads = weaken1Threads + weaken2Threads;

    const ramNeeded = (hackThreads * ns.getScriptRam(scripts.hack, "home")) +
                      (growThreads * ns.getScriptRam(scripts.grow, "home")) +
                      (totalWeakenThreads * ns.getScriptRam(scripts.weaken, "home"));

    return {
      hackThreads,
      growThreads,
      totalWeakenThreads, // On combine les threads weaken pour le premier weaken
      tHack,
      tGrow,
      tWeaken,
      ramNeeded
    };
  }

  function scoreTarget(ns, target) {
    const server = ns.getServer(target);
    if (server.moneyMax === 0 || server.requiredHackingSkill > ns.getHackingLevel()) return -Infinity;

    // Sans Formulas.exe, on utilise les fonctions directes pour les temps
    // Ce score est une heuristique simple.
    const hackTime = ns.getHackTime(target);
    const growTime = ns.getGrowTime(target);
    const weakenTime = ns.getWeakenTime(target);

    // Favorise les serveurs avec beaucoup d'argent et rapides à préparer/hacker.
    // On peut ajuster cette formule. Par exemple, donner plus de poids à moneyMax.
    // On normalise le temps pour éviter des scores trop petits pour des serveurs longs.
    // Le temps total approximatif pour un cycle est dominé par weakenTime.
    // Un score simple : moneyMax / weakenTime. Plus c'est haut, mieux c'est.
    if (weakenTime === 0) return server.moneyMax; // Éviter division par zéro si temps impossible (théoriquement)
    
    // On veut aussi un serveur qui n'est pas à sécurité maximale en permanence.
    // Un ratio difficulté actuelle / difficulté min peut aider. Proche de 1 = bien.
    const difficultyRatio = server.minDifficulty / Math.max(server.minDifficulty, server.hackDifficulty); // entre 0 et 1. Plus c'est haut, mieux c'est.

    return (server.moneyMax / weakenTime) * difficultyRatio;
  }

  async function copyScriptsToAll(servers, scriptList) {
    for (const server of servers) {
      if (server === "home") continue; // Pas besoin de copier sur home
      // ns.ls(server, "js") pour vérifier si les scripts existent déjà peut économiser du temps
      // mais scp les écrase simplement, ce qui est bien pour les mises à jour.
      await ns.scp(Object.values(scriptList), server, "home");
    }
  }

  async function executeBatchOnServer(ns, hostServer, target, threads, delays) {
    const scriptRam = {
      hack: ns.getScriptRam(scripts.hack, hostServer),
      grow: ns.getScriptRam(scripts.grow, hostServer),
      weaken: ns.getScriptRam(scripts.weaken, hostServer)
    };
    let launched = { hack: 0, grow: 0, weaken: 0 };
    let availableRam = getFreeRam(hostServer);
    let pids = []; // Pour stocker les PIDs des scripts lancés

    // Important: L'ordre de lancement ici n'est pas l'ordre d'atterrissage.
    // Les délais gèrent l'ordre d'atterrissage.
    // On lance d'abord ce qui a le moins de chance d'échouer ou ce qui est le plus critique.
    // Ou simplement dans l'ordre H, W, G.

    // Tenter de lancer Weaken
    if (threads.weaken > 0 && availableRam >= threads.weaken * scriptRam.weaken) {
        const pid = ns.exec(scripts.weaken, hostServer, threads.weaken, target, delays.weaken || 0, Date.now()); // Ajout d'un ID unique
        if (pid !== 0) {
            launched.weaken = threads.weaken;
            availableRam -= threads.weaken * scriptRam.weaken;
            pids.push(pid);
        }
    } else if (threads.weaken > 0) {
        // Essayer de lancer avec moins de threads si pas assez de RAM pour tout
        const partialThreads = Math.floor(availableRam / scriptRam.weaken);
        if (partialThreads > 0) {
            const pid = ns.exec(scripts.weaken, hostServer, partialThreads, target, delays.weaken || 0, Date.now());
             if (pid !== 0) {
                launched.weaken = partialThreads;
                availableRam -= partialThreads * scriptRam.weaken;
                pids.push(pid);
            }
        }
    }


    // Tenter de lancer Hack
    if (threads.hack > 0 && availableRam >= threads.hack * scriptRam.hack) {
      const pid = ns.exec(scripts.hack, hostServer, threads.hack, target, delays.hack || 0, Date.now());
      if (pid !== 0) {
        launched.hack = threads.hack;
        availableRam -= threads.hack * scriptRam.hack;
        pids.push(pid);
      }
    } else if (threads.hack > 0) {
        const partialThreads = Math.floor(availableRam / scriptRam.hack);
        if (partialThreads > 0) {
            const pid = ns.exec(scripts.hack, hostServer, partialThreads, target, delays.hack || 0, Date.now());
             if (pid !== 0) {
                launched.hack = partialThreads;
                availableRam -= partialThreads * scriptRam.hack;
                pids.push(pid);
            }
        }
    }

    // Tenter de lancer Grow
    if (threads.grow > 0 && availableRam >= threads.grow * scriptRam.grow) {
      const pid = ns.exec(scripts.grow, hostServer, threads.grow, target, delays.grow || 0, Date.now());
      if (pid !== 0) {
        launched.grow = threads.grow;
        // availableRam -= threads.grow * scriptRam.grow; // Déjà déduit dans la condition
        pids.push(pid);
      }
    } else if (threads.grow > 0) {
        const partialThreads = Math.floor(availableRam / scriptRam.grow);
        if (partialThreads > 0) {
            const pid = ns.exec(scripts.grow, hostServer, partialThreads, target, delays.grow || 0, Date.now());
             if (pid !== 0) {
                launched.grow = partialThreads;
                // availableRam -= partialThreads * scriptRam.grow;
                pids.push(pid);
            }
        }
    }
    
    // Un batch est considéré comme "suffisamment lancé" si au moins une partie de chaque composant prévu a démarré.
    // Si hackThreads était 0 au départ, on ne s'attend pas à lancer de hack.
    const hackSuccessfullyLaunched = (threads.hack === 0 && launched.hack === 0) || (threads.hack > 0 && launched.hack > 0);
    const growSuccessfullyLaunched = (threads.grow === 0 && launched.grow === 0) || (threads.grow > 0 && launched.grow > 0);
    const weakenSuccessfullyLaunched = (threads.weaken === 0 && launched.weaken === 0) || (threads.weaken > 0 && launched.weaken > 0);


    if (hackSuccessfullyLaunched && growSuccessfullyLaunched && weakenSuccessfullyLaunched && pids.length > 0) {
        return { ...launched, pids }; // Retourne les threads lancés et leurs PIDs
    } else {
        // Si quelque chose a été lancé mais pas tout le batch, il faut tuer ce qui a démarré pour éviter des actions isolées.
        for (const pid of pids) {
            ns.kill(pid);
        }
        return { hack: 0, grow: 0, weaken: 0, pids: [] }; // Échec du lancement du batch
    }
  }

  // --- Main Loop ---
  ns.tprint("🚀 Démarrage du gestionnaire de batchs HGW...");
  while (true) {
    const workerServers = getWorkerServers();
    if (workerServers.length === 0) {
      ns.print("😴 Aucun serveur de travail (worker) disponible (ni 'ultra-', ni autres serveurs achetés, ni 'home' avec assez de RAM). Attente...");
      await ns.sleep(30000);
      continue;
    }
    await copyScriptsToAll(workerServers, scripts); // Copie les scripts sur les workers

    const allServers = scanAll();
    const potentialTargets = allServers.filter(s => {
      if (s === "home") return false; // On ne se hack pas soi-même
      tryRoot(s); // Tenter d'obtenir root
      return ns.hasRootAccess(s) && ns.getServerMaxMoney(s) > 0 && ns.getServerRequiredHackingLevel(s) <= ns.getHackingLevel();
    });

    if (potentialTargets.length === 0) {
        ns.print("🕵️ Aucune cible potentielle trouvée. Scan en cours...");
        await ns.sleep(10000);
        continue;
    }
    
    potentialTargets.sort((a, b) => scoreTarget(ns, b) - scoreTarget(ns, a)); // Trier par score décroissant

    const targetsCurrentlyInBatch = new Set(Array.from(activeBatches.keys()));

    for (const host of workerServers) {
      let hostAvailableRam = getFreeRam(host);

      for (const target of potentialTargets) {
        if (targetsCurrentlyInBatch.has(target)) {
          //ns.print(`ℹ️ Cible ${target} déjà en cours de batch par un autre processus/serveur. Skip.`);
          continue; // Cette cible est déjà gérée par un batch actif
        }
        
        // Vérifier si un batch est déjà actif DE CE HOST vers CETTE CIBLE
        // (Normalement couvert par targetsCurrentlyInBatch, mais double-vérification si la logique change)
        // const existingBatchOnHostForTarget = Array.from(activeBatches.values()).find(b => b.host === host && b.target === target);
        // if (existingBatchOnHostForTarget) continue;


        const batchInfo = calculateBatchThreads(ns, target);
        if (!batchInfo) continue;

        const { hackThreads, growThreads, totalWeakenThreads, tHack, tGrow, tWeaken, ramNeeded } = batchInfo;

        if (ramNeeded === 0) continue; // Pas d'opération à faire

        if (ramNeeded <= hostAvailableRam) {
          // Délais calculés pour que les opérations atterrissent dans l'ordre W, H, G
          // W (totalWeakenThreads) atterrit en premier (ou en même temps que H si tWeaken = tHack)
          // H atterrit après W
          // G atterrit après H
          // Cette séquence est "Préparer (W) -> Frapper (H) -> Reconstruire (G)"
          // Le batchDelay est l'espacement souhaité entre les *fins* des opérations.

          // Weaken (pour contrer H et G) doit finir AVANT H et G.
          // Mais ici, le weaken est pour préparer ET contrer.
          // Si W1 (contre H) et W2 (contre G) sont combinés dans 'totalWeakenThreads'
          // et lancés pour atterrir avant H et G, la logique des délais doit être:
          // W (combiné) atterrit à T
          // H atterrit à T + batchDelay
          // G atterrit à T + 2*batchDelay
          // Cela signifie que le weaken initial doit être assez fort pour réduire la sécurité
          // ET compenser les augmentations de H et G qui suivront.

          const wTime = tWeaken; // Temps de weaken
          const hTime = tHack;   // Temps de hack
          const gTime = tGrow;   // Temps de grow

          // Delais pour la séquence W, H, G (atterrissage)
          // Le script 'weaken-delay.js' doit finir son weaken.
          // Le script 'hack-delay.js' doit finir son hack.
          // Le script 'grow-delay.js' doit finir son grow.
          
          // Objectif d'atterrissage :
          // Weaken_finishes_at = T0
          // Hack_finishes_at   = T0 + batchDelay
          // Grow_finishes_at   = T0 + 2 * batchDelay

          // Delais de démarrage pour atteindre cet objectif :
          // weakenStartDelay = 0 (on le fait démarrer dès que possible, il définit T0 avec sa durée)
          // hackStartDelay   = (T0 + batchDelay) - hTime  = wTime + batchDelay - hTime
          // growStartDelay   = (T0 + 2*batchDelay) - gTime = wTime + 2*batchDelay - gTime
          
          const weakenStartDelay = 0; // Le weaken part en premier, son temps d'arrivée définit la référence.
          const hackStartDelay = Math.max(0, wTime - hTime + batchDelay);
          const growStartDelay = Math.max(0, wTime - gTime + 2 * batchDelay);


          const threadsToAllocate = {
            hack: hackThreads,
            grow: growThreads,
            weaken: totalWeakenThreads
          };
          const delaysToUse = {
            hack: hackStartDelay,
            grow: growStartDelay,
            weaken: weakenStartDelay
          };

          const launched = await executeBatchOnServer(ns, host, target, threadsToAllocate, delaysToUse);
          const totalLaunchedRam = (launched.hack * ns.getScriptRam(scripts.hack, host)) +
                                   (launched.grow * ns.getScriptRam(scripts.grow, host)) +
                                   (launched.weaken * ns.getScriptRam(scripts.weaken, host));
          
          // On vérifie si on a lancé ce qu'on voulait lancer (même partiellement)
          const wantedToHack = threadsToAllocate.hack > 0;
          const wantedToGrow = threadsToAllocate.grow > 0;
          const wantedToWeaken = threadsToAllocate.weaken > 0;

          const didHack = launched.hack > 0;
          const didGrow = launched.grow > 0;
          const didWeaken = launched.weaken > 0;

          if ((wantedToHack === didHack) && (wantedToGrow === didGrow) && (wantedToWeaken === didWeaken) && (didHack || didGrow || didWeaken)) {
            const batchEndTime = Date.now() + wTime + (2 * batchDelay) + 1000; // Temps estimé de fin du batch + marge
            activeBatches.set(target, { 
                startTime: Date.now(), 
                endTime: batchEndTime, // Utiliser pour le nettoyage
                host: host, 
                target: target, 
                threads: launched,
                pids: launched.pids // stocker les PIDs pour un éventuel kill ciblé plus tard
            });
            targetsCurrentlyInBatch.add(target); // Marquer la cible comme gérée
            hostAvailableRam -= totalLaunchedRam;
            ns.print(`🎯 Batch [W:${launched.weaken}, H:${launched.hack}, G:${launched.grow}] lancé sur ${target} depuis ${host}. RAM utilisée: ${ns.formatRam(totalLaunchedRam)}. Fin estimée dans ${ns.tFormat(batchEndTime - Date.now())}`);
          } else if (launched.hack > 0 || launched.grow > 0 || launched.weaken > 0) {
            // Batch partiellement lancé mais pas comme prévu, ou executeBatchOnServer a tué les pids
            ns.print(`⚠️ Batch incomplet ou annulé pour ${target} sur ${host}. Lancé: W:${launched.weaken}, H:${launched.hack}, G:${launched.grow}. Prévu: W:${threadsToAllocate.weaken}, H:${threadsToAllocate.hack}, G:${threadsToAllocate.grow}`);
          } else {
            // Rien n'a pu être lancé
            // ns.print(`❌ Impossible de lancer un batch sur ${target} depuis ${host} (RAM: ${ns.formatRam(hostAvailableRam)} / requis: ${ns.formatRam(ramNeeded)})`);
          }
        } else {
          // ns.print(`INFO: Pas assez de RAM sur ${host} (${ns.formatRam(hostAvailableRam)}) pour batch ${target} (requis: ${ns.formatRam(ramNeeded)})`);
        }
      } // Fin boucle targets
    } // Fin boucle hosts (workerServers)

    // Nettoyer les batchs terminés
    let cleanedCount = 0;
    for (const [batchTarget, batchData] of activeBatches.entries()) {
      // Si on a stocké les PIDs, on pourrait vérifier s'ils sont toujours actifs
      // ns.isRunning(pid, host)
      // Pour l'instant, se baser sur le temps estimé de fin.
      if (Date.now() > batchData.endTime) {
        activeBatches.delete(batchTarget);
        targetsCurrentlyInBatch.delete(batchTarget); // Important pour la boucle principale
        cleanedCount++;
        //ns.print(`✅ Batch terminé pour ${batchTarget} sur ${batchData.host}.`);
      }
    }
    if (cleanedCount > 0) ns.print(`🧹 Nettoyage de ${cleanedCount} batch(s) terminé(s).`);

    await ns.sleep(1000); // Attendre un peu avant la prochaine itération
  }
}