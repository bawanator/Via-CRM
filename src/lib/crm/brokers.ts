// Back-compat shim. The `brokers` table is now `contacts`; a broker is a
// contact of type "Broker". Existing imports of listBrokers/getBroker/
// createBroker/updateBroker/resolveBrokerId and the BrokerWithStats/BrokerDetail
// types keep working. New code should import from "@/lib/crm/contacts".
export * from "@/lib/crm/contacts";
