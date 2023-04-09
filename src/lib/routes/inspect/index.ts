import { FastifyInstance } from "fastify"

import BotMaster from '../../bot/master.js'

interface InspectQuerystring {
    link: string
}

export default function inspect(fastify: FastifyInstance, botMaster: BotMaster) {
    fastify.get<{
        Querystring: InspectQuerystring
    }>('/inspect', async function (request, reply) {
        if (request.query.link) {
            try {
                reply.send(await botMaster.inspectItem(request.query.link))
            } catch (e) {
                reply.status(500).send({
                    code: 500,
                    message: e
                })
            }
        } else {
            reply.send({})
        }
    })
}