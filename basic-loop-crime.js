/** @param {NS} ns */
export async function main(ns) {
    const crime = "Traffick Arms"; // le crime voulu
    const focus = false; // Ne pas focus sur le crime (pour gagner des stats équilibrées)

    ns.tprint(`Démarrage de la boucle de crimes : ${crime}`);

    while (true) {
        const waitTime = ns.singularity.commitCrime(crime, focus);
        ns.print(`Crime commis. Prochain dans ${ns.tFormat(waitTime)}.`);
        await ns.sleep(waitTime + 50); // Attend la fin du crime + une petite marge
    }
}