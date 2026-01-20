const sql = require('mssql');

// Debug: Vérifier les variables d'environnement
console.log('🔍 Variables Azure SQL:');
console.log('  AZURE_SQL_SERVER:', process.env.AZURE_SQL_SERVER ? 'Défini' : '❌ MANQUANT');
console.log('  AZURE_SQL_DATABASE:', process.env.AZURE_SQL_DATABASE ? 'Défini' : '❌ MANQUANT');
console.log('  AZURE_SQL_USER:', process.env.AZURE_SQL_USER ? 'Défini' : '❌ MANQUANT');
console.log('  AZURE_SQL_PASSWORD:', process.env.AZURE_SQL_PASSWORD ? 'Défini' : '❌ MANQUANT');
console.log('  AZURE_SQL_AUTH_TYPE:', process.env.AZURE_SQL_AUTH_TYPE || 'default (SQL)');

// Déterminer le type d'authentification
const authType = process.env.AZURE_SQL_AUTH_TYPE || 'default';

// Configuration de la connexion Azure SQL
let config;

if (authType === 'azure-active-directory-default' || authType === 'aad') {
    // Configuration pour Azure Active Directory
    config = {
        server: process.env.AZURE_SQL_SERVER,
        database: process.env.AZURE_SQL_DATABASE,
        authentication: {
            type: 'azure-active-directory-default'
        },
        options: {
            encrypt: true,
            trustServerCertificate: false,
            enableArithAbort: true,
            connectTimeout: 30000,
            requestTimeout: 30000
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    };
    console.log('🔐 Utilisation de Azure Active Directory Authentication');
} else {
    // Configuration pour SQL Authentication (par défaut)
    config = {
        user: process.env.AZURE_SQL_USER,
        password: process.env.AZURE_SQL_PASSWORD,
        server: process.env.AZURE_SQL_SERVER,
        database: process.env.AZURE_SQL_DATABASE,
        options: {
            encrypt: true,
            trustServerCertificate: false,
            enableArithAbort: true,
            connectTimeout: 30000,
            requestTimeout: 30000
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    };
    console.log('🔐 Utilisation de SQL Authentication');
}

let poolPromise;

// Fonction pour obtenir le pool de connexions
async function getPool() {
    if (!poolPromise) {
        poolPromise = sql.connect(config)
            .then(pool => {
                console.log('✅ Connecté à Azure SQL Database');
                return pool;
            })
            .catch(err => {
                console.error('❌ Erreur de connexion à Azure SQL:', err);
                poolPromise = null;
                throw err;
            });
    }
    return poolPromise;
}

// Fonction pour insérer un feedback dans la base de données
async function insertFeedback(feedbackData) {
    try {
        const pool = await getPool();
        
        const request = pool.request();
        
        // Ajouter les paramètres
        request.input('timestamp', sql.DateTime2, new Date(feedbackData.timestamp));
        request.input('rating', sql.Int, feedbackData.rating);
        request.input('positive_comment', sql.NVarChar(sql.MAX), feedbackData.positive_comment || null);
        request.input('negative_comment', sql.NVarChar(sql.MAX), feedbackData.negative_comment || null);
        request.input('filters_useful', sql.NVarChar(50), feedbackData.filters_useful || null);
        
        request.input('model', sql.NVarChar(50), feedbackData.model || null);
        request.input('temperature', sql.Float, feedbackData.temperature || null);
        request.input('top_p', sql.Float, feedbackData.top_p || null);
        request.input('max_tokens', sql.Int, feedbackData.max_tokens || null);
        
        request.input('filter_tone', sql.NVarChar(100), feedbackData.filter_tone || null);
        request.input('filter_urgency', sql.NVarChar(100), feedbackData.filter_urgency || null);
        request.input('filter_detail', sql.NVarChar(100), feedbackData.filter_detail || null);
        request.input('filter_geo', sql.NVarChar(100), feedbackData.filter_geo || null);
        request.input('filter_style', sql.NVarChar(100), feedbackData.filter_style || null);
        request.input('filter_custom', sql.NVarChar(sql.MAX), feedbackData.filter_custom || null);
        
        request.input('full_prompt', sql.NVarChar(sql.MAX), feedbackData.full_prompt || null);
        request.input('flash_content', sql.NVarChar(sql.MAX), feedbackData.flash_content || null);
        
        request.input('ip_address', sql.NVarChar(50), feedbackData.ip_address || null);
        request.input('user_agent', sql.NVarChar(500), feedbackData.user_agent || null);
        
        // Exécuter la requête d'insertion
        const result = await request.query(`
            INSERT INTO feedback (
                timestamp, rating, positive_comment, negative_comment, filters_useful,
                model, temperature, top_p, max_tokens,
                filter_tone, filter_urgency, filter_detail, filter_geo, filter_style, filter_custom,
                full_prompt, flash_content,
                ip_address, user_agent
            )
            VALUES (
                @timestamp, @rating, @positive_comment, @negative_comment, @filters_useful,
                @model, @temperature, @top_p, @max_tokens,
                @filter_tone, @filter_urgency, @filter_detail, @filter_geo, @filter_style, @filter_custom,
                @full_prompt, @flash_content,
                @ip_address, @user_agent
            );
            SELECT SCOPE_IDENTITY() AS id;
        `);
        
        const insertedId = result.recordset[0].id;
        console.log(`✅ Feedback inséré avec succès (ID: ${insertedId})`);
        
        return {
            success: true,
            id: insertedId
        };
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'insertion du feedback:', error);
        throw error;
    }
}

// Fonction pour récupérer les statistiques de feedback
async function getFeedbackStats() {
    try {
        const pool = await getPool();
        
        const result = await pool.request().query(`
            SELECT 
                COUNT(*) as total_feedbacks,
                AVG(CAST(rating as FLOAT)) as average_rating,
                COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive_feedbacks,
                COUNT(CASE WHEN rating <= 2 THEN 1 END) as negative_feedbacks
            FROM feedback
        `);
        
        return result.recordset[0];
        
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des statistiques:', error);
        throw error;
    }
}

// Fonction pour fermer la connexion (utile pour les tests)
async function closePool() {
    if (poolPromise) {
        const pool = await poolPromise;
        await pool.close();
        poolPromise = null;
        console.log('🔌 Connexion à Azure SQL fermée');
    }
}

module.exports = {
    insertFeedback,
    getFeedbackStats,
    closePool
};
