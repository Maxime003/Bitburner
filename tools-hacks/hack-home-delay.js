/** @param {NS} ns **/
export async function main(ns) {
    const [target, delay] = ns.args;
    await ns.sleep(Number(delay)); // Utiliser Number() est plus sûr
    await ns.hack(target);
}