/** Exact signed rational arithmetic used for every gear ratio. */
export class Frac {
  readonly n: bigint;
  readonly d: bigint;

  constructor(n: number | bigint | Frac = 0, d: number | bigint = 1) {
    let bn: bigint;
    let bd: bigint;
    if (n instanceof Frac) {
      bn = n.n;
      bd = n.d;
    } else {
      bn = BigInt(n);
      bd = BigInt(d);
    }
    if (bd === 0n) throw new Error('Denominator cannot be zero');
    if (bd < 0n) {
      bn = -bn;
      bd = -bd;
    }
    const g = Frac.gcd(bn < 0n ? -bn : bn, bd);
    this.n = bn / g;
    this.d = bd / g;
  }

  static gcd(a: bigint, b: bigint): bigint {
    let x = a;
    let y = b;
    while (y) [x, y] = [y, x % y];
    return x || 1n;
  }

  static ZERO = new Frac(0);
  static ONE = new Frac(1);

  mul(o: Frac | number): Frac {
    const f = o instanceof Frac ? o : new Frac(o);
    return new Frac(this.n * f.n, this.d * f.d);
  }

  div(o: Frac | number): Frac {
    const f = o instanceof Frac ? o : new Frac(o);
    return new Frac(this.n * f.d, this.d * f.n);
  }

  neg(): Frac {
    return new Frac(-this.n, this.d);
  }

  add(o: Frac | number): Frac {
    const f = o instanceof Frac ? o : new Frac(o);
    return new Frac(this.n * f.d + f.n * this.d, this.d * f.d);
  }

  equals(o: Frac): boolean {
    return this.n === o.n && this.d === o.d;
  }

  cmp(o: Frac): -1 | 0 | 1 {
    const x = this.n * o.d;
    const y = o.n * this.d;
    return x === y ? 0 : x < y ? -1 : 1;
  }

  abs(): Frac {
    return this.n < 0n ? this.neg() : this;
  }

  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  toFractionString(): string {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }

  toFixed(digits = 6): string {
    return this.toNumber().toFixed(digits);
  }
}

export function productFrac(values: Frac[]): Frac {
  return values.reduce((acc, v) => acc.mul(v), Frac.ONE);
}
