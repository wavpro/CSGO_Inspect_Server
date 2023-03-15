import { FastifyInstance } from 'fastify'

export default function router(fastify: FastifyInstance) {
    fastify.get('/', function (request, reply) {
        reply.send({ hello: 'world' })
      })
    fastify.get('/inspect', function (request, reply) {
        reply.send(request.query)
      })
}