/** @param {NS} ns */
export async function main(ns) {
    const maxLevel = 200;
    const maxRam = 64;
    const maxCores = 16;

    while (true) {
        let cheapestUpgrade = null;
        let cheapestCost = Infinity;

        // Parcourir tous les nœuds pour trouver l'amélioration la moins chère
        for (let i = 0; i < ns.hacknet.numNodes(); i++) {
            const stats = ns.hacknet.getNodeStats(i);

            // Vérification du coût des upgrades
            const levelCost = stats.level < maxLevel ? ns.hacknet.getLevelUpgradeCost(i, 1) : Infinity;
            const ramCost = stats.ram < maxRam ? ns.hacknet.getRamUpgradeCost(i, 1) : Infinity;
            const coreCost = stats.cores < maxCores ? ns.hacknet.getCoreUpgradeCost(i, 1) : Infinity;

            // Trouver l'upgrade la moins chère disponible
            if (levelCost < cheapestCost && levelCost <= ns.getServerMoneyAvailable("home")) {
                cheapestUpgrade = { type: 'level', index: i };
                cheapestCost = levelCost;
            }
            if (ramCost < cheapestCost && ramCost <= ns.getServerMoneyAvailable("home")) {
                cheapestUpgrade = { type: 'ram', index: i };
                cheapestCost = ramCost;
            }
            if (coreCost < cheapestCost && coreCost <= ns.getServerMoneyAvailable("home")) {
                cheapestUpgrade = { type: 'core', index: i };
                cheapestCost = coreCost;
            }
        }

        // Si une amélioration est trouvée, on l'achète
        if (cheapestUpgrade !== null) {
            switch (cheapestUpgrade.type) {
                case 'level':
                    ns.hacknet.upgradeLevel(cheapestUpgrade.index, 1);
                    ns.tprint(`🛠️ Niveau amélioré sur le nœud ${cheapestUpgrade.index}`);
                    break;
                case 'ram':
                    ns.hacknet.upgradeRam(cheapestUpgrade.index, 1);
                    ns.tprint(`💾 RAM améliorée sur le nœud ${cheapestUpgrade.index}`);
                    break;
                case 'core':
                    ns.hacknet.upgradeCore(cheapestUpgrade.index, 1);
                    ns.tprint(`🧠 Core amélioré sur le nœud ${cheapestUpgrade.index}`);
                    break;
            }
        } else {
            // Si tout est maxé, on essaie d'acheter un nouveau nœud
            const newNodeCost = ns.hacknet.getPurchaseNodeCost();
            if (newNodeCost <= ns.getServerMoneyAvailable("home")) {
                ns.hacknet.purchaseNode();
                ns.tprint("✨ Nouveau nœud acheté !");
            }
        }

        // Pause de 5 secondes avant le prochain cycle
        await ns.sleep(5000);
    }
}
