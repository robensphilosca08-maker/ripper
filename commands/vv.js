const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys')

const MAX_UNWRAP_DEPTH = 10

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// Dépacke récursivement les conteneurs de messages (vue unique v1/v2, éphémère,
// document avec légende, etc.) jusqu'à atteindre le message réel.
function unwrapMessage(message, depth = 0) {
  if (!message || typeof message !== 'object' || depth >= MAX_UNWRAP_DEPTH) return message

  const inner =
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.ephemeralMessage?.message ||
    message.documentWithCaptionMessage?.message ||
    message.editedMessage?.message ||
    null

  return inner ? unwrapMessage(inner, depth + 1) : message
}

module.exports = {
  name: 'vv',
  description: 'Télécharge une image, une vidéo ou un audio (y compris en vue unique) et l\'envoie en message privé',

  async execute({ sock, jid, quotedMessage }) {
    if (!quotedMessage) {
      return sock.sendMessage(jid, {
        text: 'Répondez à une image, une vidéo ou un audio (normal ou vue unique).'
      })
    }

    const innerMessage = unwrapMessage(quotedMessage)

    let type
    let media

    if (innerMessage?.imageMessage) {
      type = 'image'
      media = innerMessage.imageMessage
    } else if (innerMessage?.videoMessage) {
      type = 'video'
      media = innerMessage.videoMessage
    } else if (innerMessage?.audioMessage) {
      type = 'audio'
      media = innerMessage.audioMessage
    }

    if (!media) {
      return sock.sendMessage(jid, {
        text: 'Le message ciblé ne contient pas d\'image, de vidéo ou d\'audio.'
      })
    }

    try {
      const stream = await downloadContentFromMessage(media, type)
      const buffer = await streamToBuffer(stream)

      const payload = { [type]: buffer }

      if (type === 'audio') {
        payload.mimetype = media.mimetype || 'audio/mp4'
        payload.ptt = Boolean(media.ptt)
      } else if (media.caption) {
        payload.caption = media.caption
      }

      // Envoi dans la discussion personnelle de l'utilisateur
      const ownJid = jidNormalizedUser(sock.user.id)
      await sock.sendMessage(ownJid, payload)

      // Confirmation discrète dans la discussion d'origine
      if (jid !== ownJid) {
        await sock.sendMessage(jid, { text: '✅ Média envoyé en privé.' })
      }
    } catch (err) {
      console.error('[vv] Erreur téléchargement:', err)
      await sock.sendMessage(jid, {
        text: 'Impossible de récupérer ce média.'
      })
    }
  },
}
