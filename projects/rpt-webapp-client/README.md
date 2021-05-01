# rpt-webapp-client

## Brief

RpT WebApp engine is a library to develop webapps which need interaction with
other clients, like web-based games, meeting, etc.

It is based over RPTL Protocol, which manages current webapp session (who's logged in for example), and
SER Protocol (standing for Service Event Request protocol) over RPTL.

Key idea is into SER Protocol : online Services might receive Requests from clients registered with RPTL
(called *actors*) and might send them Events which notify actors about
modifications inside current service state (i.e. : a new message inside a Chat service).

Basically:
- RPTL protocol manages clients connection. It handles clients who logged in/out.
  When a client is logged in (or *registered*) its messages are passed to overlying 
  protocol (SER Protocol)
- SER protocol manages interaction with registered clients (or *actors*) and
  services. Client sends a Service Request to make an action, server responds with a Service
  Request Response to accept or decline this action. Where something happens
  server-side, concerned Service sends a Service Event to all actors so they
  are synced with server.
  
As the whole internal webapp logic is handled by server, this library mainly
provides support for RPTL and SER protocol, with Service facility features. 

To get more details about protocols specifications,
check for [server docs](https://github.com/ThisALV/RpT-Minigames-Server).
  
## Install

Install as a dependency for one of your projects:
```shell
npm install -S rpt-webapp-client
```

## Get documentation

Most of this library code is documented, generate to `docs/index.html`
using:
```shell
npm run doc
```
