-- Schéma de la table pour stocker les feedbacks des utilisateurs
-- Base de données: infotrafic-sql-db (Azure SQL)

CREATE TABLE feedback (
    id INT IDENTITY(1,1) PRIMARY KEY,
    timestamp DATETIME2 NOT NULL DEFAULT GETDATE(),
    
    -- Évaluation
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    positive_comment NVARCHAR(MAX),
    negative_comment NVARCHAR(MAX),
    filters_useful NVARCHAR(50),
    
    -- Configuration IA utilisée
    model NVARCHAR(50),
    temperature FLOAT,
    top_p FLOAT,
    max_tokens INT,
    
    -- Filtres de prompt utilisés
    filter_tone NVARCHAR(100),
    filter_urgency NVARCHAR(100),
    filter_detail NVARCHAR(100),
    filter_geo NVARCHAR(100),
    filter_style NVARCHAR(100),
    filter_custom NVARCHAR(MAX),
    
    -- Prompt complet et résultat
    full_prompt NVARCHAR(MAX),
    flash_content NVARCHAR(MAX),
    
    -- Métadonnées
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    ip_address NVARCHAR(50),
    user_agent NVARCHAR(500)
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX idx_feedback_timestamp ON feedback(timestamp DESC);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_feedback_model ON feedback(model);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);
