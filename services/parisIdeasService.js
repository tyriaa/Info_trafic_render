const axios = require('axios');

const BASE_URL = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records";

function stripHtml(text) {
    if (!text) return "";
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n");
    text = text.replace(/<[^>]+>/g, "");
    text = text.replace(/\n{2,}/g, "\n");
    return text.trim();
}

function compactText(text, maxLen = 160) {
    const clean = stripHtml(text).replace(/\s+/g, " ");
    if (clean.length <= maxLen) return clean;
    return clean.substring(0, maxLen - 1).trimEnd() + "…";
}

function firstUsefulDateLine(dateDescription) {
    const clean = stripHtml(dateDescription);
    if (!clean) return "Date non précisée";
    const lines = clean.split("\n").map(l => l.trim()).filter(l => l);
    return lines[0] || "Date non précisée";
}

function isEditorialOrTooGeneric(item) {
    const title = (item.title || "").toLowerCase();
    const lead = (item.lead_text || "").toLowerCase();

    const bannedPatterns = [
        "à faire à paris", "a faire a paris", "cette année", "cette annee",
        "agenda des", "que faire à paris", "que faire a paris", "notre agenda",
        "sélection", "selection", "tour d'horizon"
    ];

    if (bannedPatterns.some(pattern => title.includes(pattern))) {
        return true;
    }

    const genericPatterns = ["master classes", "rencontres, restitutions", "conférences", "conference"];
    if (genericPatterns.some(pattern => title.includes(pattern)) && lead.includes("atelier")) {
        return true;
    }

    return false;
}

function isSingleOrSimpleEvent(item) {
    const occurrences = item.occurrences || "";
    if ((occurrences.match(/;/g) || []).length >= 3) {
        return false;
    }

    const dateDescription = stripHtml(item.date_description || "");
    if ((dateDescription.match(/Le /g) || []).length >= 4) {
        return false;
    }

    return true;
}

function parseDate(value) {
    if (!value) return null;
    try {
        return new Date(value);
    } catch {
        return null;
    }
}

function hasValidDates(item) {
    const start = parseDate(item.date_start);
    const end = parseDate(item.date_end);
    return start && end && start <= end;
}

function dedupe(items) {
    const seen = new Set();
    const out = [];

    for (const item of items) {
        const key = item.event_id || `${item.title}__${item.date_start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }

    return out;
}

function scoreItem(item, upcoming = false) {
    let score = 0;
    const now = new Date();

    const updatedAt = parseDate(item.updated_at);
    if (updatedAt) {
        const ageHours = (now - updatedAt) / (1000 * 60 * 60);
        score += Math.max(0, 80 - ageHours);
    }

    const start = parseDate(item.date_start);
    if (upcoming && start) {
        const daysUntil = (start - now) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 40 - daysUntil);
    }

    if ((item.price_type || "").toLowerCase().includes("gratuit")) {
        score += 8;
    }

    if ((item.address_city || "").toLowerCase() === "paris") {
        score += 5;
    }

    if (isSingleOrSimpleEvent(item)) {
        score += 10;
    }

    return score;
}

function cleanItems(items, upcoming = false) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let filtered = items.filter(item => {
        if (!hasValidDates(item)) return false;
        if (isEditorialOrTooGeneric(item)) return false;
        if (!isSingleOrSimpleEvent(item)) return false;

        const start = parseDate(item.date_start);
        if (!start) return false;

        const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        
        if (upcoming && startDate <= today) {
            return false;
        }

        return true;
    });

    filtered = dedupe(filtered);
    
    // Trier par date de début (du plus récent au plus lointain)
    filtered.sort((a, b) => {
        const dateA = parseDate(a.date_start);
        const dateB = parseDate(b.date_start);
        
        if (!dateA) return 1;
        if (!dateB) return -1;
        
        return dateA - dateB;
    });
    
    return filtered;
}

function formatItem(item) {
    return {
        title: item.title || "Sans titre",
        url: item.url || "",
        when: firstUsefulDateLine(item.date_description),
        place: item.address_name || item.address_city || "Lieu non précisé",
        price: item.price_type || "Tarif non précisé",
        summary: compactText(item.lead_text || item.description)
    };
}

async function getParisIdeas() {
    try {
        const todayResponse = await axios.get(BASE_URL, {
            params: {
                limit: "60",
                where: "date_start >= now(hour=0, minute=0, second=0, microsecond=0) AND date_start < now(days=1, hour=0, minute=0, second=0, microsecond=0)",
                order_by: "updated_at DESC"
            },
            timeout: 20000
        });

        const upcomingResponse = await axios.get(BASE_URL, {
            params: {
                limit: "60",
                where: "date_start > now() AND date_start <= now(days=30)",
                order_by: "date_start ASC"
            },
            timeout: 20000
        });

        const todayItems = cleanItems(todayResponse.data.results || []).slice(0, 10).map(formatItem);
        const upcomingItems = cleanItems(upcomingResponse.data.results || [], true).slice(0, 5).map(formatItem);

        return {
            today: todayItems,
            upcoming: upcomingItems
        };
    } catch (error) {
        console.error('Erreur lors de la récupération des idées Paris:', error.message);
        throw error;
    }
}

module.exports = { getParisIdeas };
