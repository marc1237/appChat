const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const path = require('path');

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'me-comunications-media';

// Inizializza il client di Azure
let blobServiceClient;
let containerClient;

if (AZURE_STORAGE_CONNECTION_STRING && AZURE_STORAGE_CONNECTION_STRING !== 'tua_connection_string') {
  blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
  containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  
  // Crea il container se non esiste (funziona solo se la connessione è valida)
  containerClient.createIfNotExists({ access: 'blob' }).catch(err => {
    console.warn("Impossibile creare il container Azure, verifica la connection string:", err.message);
  });
} else {
  console.warn("⚠️ AZURE_STORAGE_CONNECTION_STRING non configurata. Upload ignorati o mockati.");
}

/**
 * Carica e comprime un'immagine su Azure Blob Storage
 * @param {Buffer} buffer - Il buffer del file immagine
 * @param {String} originalName - Nome originale del file
 * @returns {String} URL pubblico del file su Azure
 */
async function uploadAndCompressImage(buffer, originalName) {
  if (!containerClient) return `https://placehold.co/800x600?text=Immagine+Mock`;

  try {
    // Compressione con Sharp (risoluzione alta, compressione JPEG a 80)
    const compressedBuffer = await sharp(buffer)
      .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const blobName = `images/${uuidv4()}-${path.basename(originalName)}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(compressedBuffer, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' }
    });

    return blockBlobClient.url;
  } catch (error) {
    console.error('Errore durante l\'upload dell\'immagine:', error);
    throw error;
  }
}

/**
 * Carica un file (es. video o audio) su Azure Blob Storage
 * @param {Buffer} buffer - Buffer del file
 * @param {String} originalName - Nome originale del file
 * @param {String} mimeType - Tipo MIME del file
 * @returns {String} URL pubblico del file
 */
async function uploadMedia(buffer, originalName, mimeType) {
  if (!containerClient) return `https://placehold.co/800x600/000/fff.mp4?text=Media+Mock`;

  try {
    const folder = mimeType.startsWith('video') ? 'videos' : 'audio';
    const blobName = `${folder}/${uuidv4()}-${path.basename(originalName)}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimeType }
    });

    return blockBlobClient.url;
  } catch (error) {
    console.error('Errore durante l\'upload del media:', error);
    throw error;
  }
}

module.exports = {
  uploadAndCompressImage,
  uploadMedia
};
