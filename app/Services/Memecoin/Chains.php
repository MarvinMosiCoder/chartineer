<?php

namespace App\Services\Memecoin;

use Illuminate\Validation\ValidationException;

class Chains
{
    public const SOLANA = '/^[1-9A-HJ-NP-Za-km-z]{32,44}$/D';
    public const EVM = '/^0x[0-9a-fA-F]{40}$/D';

    public static function normalize(string $address): string
    {
        return str_starts_with($address, '0x') ? strtolower($address) : $address;
    }

    public static function validate(string $chain, string $address): string
    {
        $network = config('memecoin.chains.'.$chain);
        if (!$network || !preg_match($network['family'] === 'solana' ? self::SOLANA : self::EVM, $address)) {
            throw ValidationException::withMessages(['address' => 'Enter a valid token or wallet address for the selected chain.']);
        }

        return self::normalize($address);
    }

    public static function any(string $address): string
    {
        if (!preg_match(self::SOLANA, $address) && !preg_match(self::EVM, $address)) {
            throw ValidationException::withMessages(['address' => 'Enter a full Solana or EVM address.']);
        }

        return self::normalize($address);
    }
}
