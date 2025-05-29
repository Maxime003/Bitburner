/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const visited = new Set();
    const queue = [["home"]];

    ns.tprint(`🚀 Début de la recherche pour ${target}`);
    ns.tprint(`📌 Queue initiale : ${JSON.stringify(queue)}`);

    while (queue.length > 0) {
        const path = queue.shift();
        const server = path[path.length - 1];

        ns.tprint(`\n➡️ Exploration de : ${server}`);
        ns.tprint(`📌 Chemin actuel : ${path.join(" -> ")}`);
        
        if (visited.has(server)) {
            ns.tprint(`🔁 Déjà visité, on passe.`);
            continue;
        }

        visited.add(server);

        if (server === target) {
            ns.tprint(`\n✅ Chemin trouvé : ${path.join(" -> ")}`);
            return;
        }

        const neighbors = ns.scan(server);
        ns.tprint(`🔎 Voisins trouvés : ${neighbors.join(", ")}`);

        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                const newPath = [...path, neighbor];
                queue.push(newPath);
                ns.tprint(`➕ Ajout à la queue : ${newPath.join(" -> ")}`);
            }
        }

        ns.tprint(`📌 Queue mise à jour : ${JSON.stringify(queue)}`);
    }

    ns.tprint("❌ Serveur introuvable.");
}
