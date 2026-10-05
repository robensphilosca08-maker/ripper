const { downloadContentFromMessage } = require('@whiskeysockets/baileys')

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

module.exports = {
  name: 'vv',
  description: 'Télécharge une image, une vidéo ou un audio (y compris en vue unique)',

  async execute({ sock, jid, quotedMessage }) {
    if (!quotedMessage) {
      return sock.sendMessage(jid, {
        text: 'Répondez à une image, une vidéo ou un audio (normal ou vue unique).'
      })
    }

    // Extraction du message interne si c'est un message en vue unique (v1 ou v2)
    const innerMessage =
      quotedMessage.viewOnceMessage?.message ||
      quotedMessage.viewOnceMessageV2?.message ||
      quotedMessage.viewOnceMessageV2Extension?.message ||
      quotedMessage

    let type
    let media

    if (innerMessage.imageMessage) {
      type = 'image'
      media = innerMessage.imageMessage
    } else if (innerMessage.videoMessage) {
      type = 'video'
      media = innerMessage.videoMessage
    } else if (innerMessage.audioMessage) {
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

      await sock.sendMessage(jid, payload)
    } catch (err) {
      console.error('[vv] Erreur téléchargement:', err)
      await sock.sendMessage(jid, {
        text: 'Impossible de récupérer ce média.'
      })
    }
  },
}
