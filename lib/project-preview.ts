export function addressPlan(lan: number, host: number) {
  if (
    !Number.isInteger(lan) ||
    lan < 1 ||
    lan > 250 ||
    !Number.isInteger(host) ||
    host < 2 ||
    host > 254
  )
    return null;
  const subnet = (n: number) => `10.10.${n}`;
  return [
    {
      id: 'PC1',
      kind: '终端',
      ip: `${subnet(lan)}.${host}/24`,
      config: `ip addr add ${subnet(lan)}.${host}/24 dev eth0\nip route replace default via ${subnet(lan)}.1`,
    },
    {
      id: 'FRR1',
      kind: '路由器',
      ip: `${subnet(lan)}.1/24`,
      config: `interface eth0\n ip address ${subnet(lan)}.1/24\ninterface eth1\n ip address 10.255.1.1/30\nrouter ospf\n network ${subnet(lan)}.0/24 area 0\n network 10.255.1.0/30 area 0`,
    },
    {
      id: 'FRR2',
      kind: '路由器',
      ip: `${subnet(lan + 1)}.1/24`,
      config: `interface eth0\n ip address 10.255.1.2/30\ninterface eth1\n ip address ${subnet(lan + 1)}.1/24\nrouter ospf\n network ${subnet(lan + 1)}.0/24 area 0\n network 10.255.1.0/30 area 0`,
    },
    {
      id: 'PC2',
      kind: '终端',
      ip: `${subnet(lan + 1)}.${host}/24`,
      config: `ip addr add ${subnet(lan + 1)}.${host}/24 dev eth0\nip route replace default via ${subnet(lan + 1)}.1`,
    },
  ];
}
