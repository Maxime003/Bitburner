/** @param {NS} ns **/
export async function main(ns) {
    const serversToScan = ["home"];
    const scanned = new Set();
    const rootedServers = [];
    const serverPaths = { "home": "" };

    // Exploration du réseau
    while (serversToScan.length > 0) {
        const current = serversToScan.pop();
        if (scanned.has(current)) continue;
        scanned.add(current);

        const neighbors = ns.scan(current);
        for (const neighbor of neighbors) {
            if (!scanned.has(neighbor)) {
                serversToScan.push(neighbor);
                serverPaths[neighbor] = `${serverPaths[current]} -> ${neighbor}`;
            }
        }

        // On ne tente de rooter que si ce n'est pas déjà fait
        if (!ns.hasRootAccess(current)) {
            try {
                let openedPorts = 0;

                if (ns.fileExists("BruteSSH.exe", "home")) {
                    ns.brutessh(current);
                    openedPorts++;
                }
                if (ns.fileExists("FTPCrack.exe", "home")) {
                    ns.ftpcrack(current);
                    openedPorts++;
                }
                if (ns.fileExists("relaySMTP.exe", "home")) {
                    ns.relaysmtp(current);
                    openedPorts++;
                }
                if (ns.fileExists("HTTPWorm.exe", "home")) {
                    ns.httpworm(current);
                    openedPorts++;
                }
                if (ns.fileExists("SQLInject.exe", "home")) {
                    ns.sqlinject(current);
                    openedPorts++;
                }

                const requiredPorts = ns.getServerNumPortsRequired(current);

                if (openedPorts >= requiredPorts) {
                    ns.nuke(current);
                    rootedServers.push(current);
                    ns.tprint(`✅ Rooté : ${current} comme un chef !`);
                } else {
                    ns.tprint(`❌ Pas assez de ports ouverts pour rooter ${current} - (${openedPorts}/${requiredPorts})`);
                }
            } catch (e) {
                ns.tprint(`⚠️ Erreur sur ${current} : ${e}`);
            }
        }
    }

    // Sauvegarde dans un fichier texte
    if (rootedServers.length > 0) {
        ns.tprint("🟢 Nouveaux serveurs rootés : " + rootedServers.join(", "));
        await ns.write("rooted-servers.txt", rootedServers.join("\n"), "w");
        ns.tprint("📂 Liste enregistrée dans rooted-servers.txt");
    } else {
        ns.tprint("⚠️ Aucun nouveau serveur rooté cette fois.");
    }

    // Affichage des chemins d'accès
    ns.tprint("🛣️ Chemins vers les serveurs rootés :");
    for (const server of rootedServers) {
        ns.tprint(`- ${serverPaths[server]} -> ${server}`);
    }
}
